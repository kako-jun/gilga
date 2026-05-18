/**
 * gilga — Unshorten Worker
 *
 * 短縮 URL（bit.ly, t.co, lnkd.in 等）に対して redirect を手動で辿り、
 * 最終的にどこへ着くかを JSON で返す。レスポンス body は読まない（ヘッダのみ）。
 *
 * セキュリティ方針:
 * - http/https 以外の scheme は拒否
 * - localhost / private IP への SSRF を遮断
 * - 入力 URL の長さ上限 2048 文字
 * - 各 hop タイムアウト 5 秒、全体タイムアウト 15 秒
 * - 最大 10 hop
 * - User-Agent を gilga-unshortener として明示
 * - CORS は本番 origin と localhost dev のみ許可
 * - ログにはホスト名のみ残す（フルURLはログしない）
 */

export interface Env {
  // 環境変数が必要になったらここに足す。今は無し。
  ALLOWED_ORIGINS?: string;
}

type HopRecord = {
  url: string;
  status: number;
  location?: string;
  hopIndex: number;
  hostname: string;
};

type SuccessResponse = {
  ok: true;
  hops: HopRecord[];
  finalUrl: string;
  finalHostname: string;
  redirectCount: number;
  truncated: boolean;
};

type ErrorCode =
  | 'invalid_url'
  | 'too_many_redirects'
  | 'fetch_failed'
  | 'invalid_scheme'
  | 'timeout'
  | 'rate_limit'
  | 'forbidden_target'
  | 'url_too_long'
  | 'method_not_allowed'
  | 'missing_url'
  | 'not_found';

type ErrorResponse = {
  ok: false;
  error: ErrorCode;
  message: string;
};

const MAX_HOPS = 10;
const MAX_URL_LEN = 2048;
const HOP_TIMEOUT_MS = 5_000;
const TOTAL_TIMEOUT_MS = 15_000;
const USER_AGENT =
  'gilga-unshortener/1.0 (+https://gilga.llll-ll.com)';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://gilga.llll-ll.com',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
];

/** CORS 許可オリジン判定。Env 未設定時はデフォルトリストで判定。 */
function resolveCorsOrigin(req: Request, env: Env): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(req: Request, env: Env): HeadersInit {
  const allowOrigin = resolveCorsOrigin(req, env);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;
  return headers;
}

function jsonResponse(
  body: SuccessResponse | ErrorResponse,
  init: ResponseInit,
  req: Request,
  env: Env,
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(req, env),
      ...(init.headers ?? {}),
    },
  });
}

function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  req: Request,
  env: Env,
): Response {
  return jsonResponse({ ok: false, error: code, message }, { status }, req, env);
}

/** localhost / private IPv4 / IPv6 link-local の判定。SSRF 対策。 */
function isForbiddenHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();

  // 明示的に危険なホスト名
  if (h === 'localhost') return true;
  if (h.endsWith('.localhost')) return true;
  if (h.endsWith('.local')) return true; // mDNS
  if (h.endsWith('.internal')) return true;

  // IPv6 のブラケット表記
  if (h.startsWith('[') && h.endsWith(']')) {
    const inner = h.slice(1, -1);
    // ::1, fe80::, fc00::/7
    if (inner === '::1' || inner === '::') return true;
    if (inner.startsWith('fe80:') || inner.startsWith('fe80::')) return true;
    if (inner.startsWith('fc') || inner.startsWith('fd')) return true;
    return false;
  }

  // IPv4 のドット表記
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    const c = Number(ipv4[3]);
    const d = Number(ipv4[4]);
    if ([a, b, c, d].some((n) => n < 0 || n > 255)) return true;
    // 10.0.0.0/8
    if (a === 10) return true;
    // 127.0.0.0/8
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local, includes AWS metadata 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 0.0.0.0/8
    if (a === 0) return true;
    // 100.64.0.0/10 (CGNAT) ※過剰防衛だが許容
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 224.0.0.0/4 (multicast)
    if (a >= 224) return true;
    return false;
  }

  return false;
}

/** URL パース + scheme / 長さ / SSRF チェック。問題ない URL を返す。 */
type Validation =
  | { kind: 'ok'; url: URL }
  | { kind: 'invalid_url' }
  | { kind: 'invalid_scheme' }
  | { kind: 'forbidden_target' }
  | { kind: 'url_too_long' };

function validateTargetUrl(raw: string): Validation {
  if (raw.length > MAX_URL_LEN) return { kind: 'url_too_long' };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { kind: 'invalid_url' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { kind: 'invalid_scheme' };
  }
  if (isForbiddenHostname(u.hostname)) return { kind: 'forbidden_target' };
  return { kind: 'ok', url: u };
}

/** 1 hop を実行。タイムアウトは AbortSignal で。 */
async function doFetchHop(
  url: URL,
  totalSignal: AbortSignal,
): Promise<Response> {
  const ctl = new AbortController();
  const hopTimer = setTimeout(() => ctl.abort(), HOP_TIMEOUT_MS);
  // 全体タイムアウトも合成
  const onAbort = () => ctl.abort();
  totalSignal.addEventListener('abort', onAbort, { once: true });

  try {
    return await fetch(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: ctl.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.5',
        // 一部の追跡 URL は Referer 無いと挙動が違うが、プライバシー優先で空のまま
      },
      // body は読まないが、Workers fetch は明示で破棄するために `cache: 'no-store'` を付ける
      cf: {
        cacheTtl: 0,
        cacheEverything: false,
      },
    });
  } finally {
    clearTimeout(hopTimer);
    totalSignal.removeEventListener('abort', onAbort);
  }
}

/** Response の body を即座に破棄する。メモリ・帯域圧迫対策。 */
async function discardBody(res: Response): Promise<void> {
  try {
    // Workers では res.body?.cancel() でストリームを止められる
    await res.body?.cancel();
  } catch {
    // 無視
  }
}

/** redirect chain を辿る本体。 */
async function followRedirects(
  startUrl: URL,
): Promise<SuccessResponse | ErrorResponse> {
  const totalCtl = new AbortController();
  const totalTimer = setTimeout(() => totalCtl.abort(), TOTAL_TIMEOUT_MS);

  const hops: HopRecord[] = [];
  let currentUrl: URL = startUrl;
  let truncated = false;

  try {
    for (let i = 0; i < MAX_HOPS + 1; i++) {
      if (i === MAX_HOPS) {
        // MAX_HOPS 回試行した結果まだ redirect なら truncated
        truncated = true;
        break;
      }

      // SSRF 対策: 各 hop で改めて検証
      if (isForbiddenHostname(currentUrl.hostname)) {
        return {
          ok: false,
          error: 'forbidden_target',
          message: `Redirect target is forbidden: ${currentUrl.hostname}`,
        };
      }

      let res: Response;
      try {
        res = await doFetchHop(currentUrl, totalCtl.signal);
      } catch (err) {
        const aborted = totalCtl.signal.aborted;
        // ログにはホストだけ
        console.warn(
          `[unshorten] fetch failed host=${currentUrl.hostname} hop=${i} aborted=${aborted}`,
        );
        if (aborted) {
          return {
            ok: false,
            error: 'timeout',
            message: 'Request timed out',
          };
        }
        const msg = err instanceof Error ? err.name : 'unknown';
        if (msg === 'AbortError') {
          return { ok: false, error: 'timeout', message: 'Hop timed out' };
        }
        return {
          ok: false,
          error: 'fetch_failed',
          message: 'Failed to fetch redirect target',
        };
      }

      const status = res.status;
      const location = res.headers.get('location');
      // body はすぐ捨てる
      await discardBody(res);

      const hop: HopRecord = {
        url: currentUrl.toString(),
        status,
        hopIndex: i,
        hostname: currentUrl.hostname,
      };
      if (location) hop.location = location;
      hops.push(hop);

      // 3xx + Location → 次の hop
      if (status >= 300 && status < 400 && location) {
        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          // 不正な Location は終端扱い
          break;
        }
        if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
          return {
            ok: false,
            error: 'invalid_scheme',
            message: `Redirect target uses non-http(s) scheme: ${nextUrl.protocol}`,
          };
        }
        if (nextUrl.toString().length > MAX_URL_LEN) {
          return {
            ok: false,
            error: 'url_too_long',
            message: 'Redirect URL exceeds 2048 chars',
          };
        }
        currentUrl = nextUrl;
        continue;
      }

      // 2xx / 4xx / 5xx 何でも終端
      break;
    }
  } finally {
    clearTimeout(totalTimer);
  }

  if (hops.length === 0) {
    return {
      ok: false,
      error: 'fetch_failed',
      message: 'No hops recorded',
    };
  }

  if (truncated) {
    return {
      ok: false,
      error: 'too_many_redirects',
      message: `Exceeded ${MAX_HOPS} hops`,
    };
  }

  // 最終 URL は「最後の hop の url」。3xx で終わっていた場合（Location 無い 3xx）も同じ。
  const lastHop = hops[hops.length - 1];
  const finalUrlStr = lastHop.url;
  let finalHostname = lastHop.hostname;
  try {
    finalHostname = new URL(finalUrlStr).hostname;
  } catch {
    /* keep */
  }

  return {
    ok: true,
    hops,
    finalUrl: finalUrlStr,
    finalHostname,
    redirectCount: hops.length - 1,
    truncated: false,
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(req, env),
      });
    }

    const url = new URL(req.url);

    // ルーティング: /api/unshorten のみ受け付ける。ルート / は簡素な hello。
    if (url.pathname !== '/api/unshorten' && url.pathname !== '/') {
      return errorResponse(
        'not_found',
        'Endpoint not found',
        404,
        req,
        env,
      );
    }

    if (url.pathname === '/') {
      // ヘルスチェック用
      return new Response(
        JSON.stringify({
          ok: true,
          service: 'gilga-unshorten',
          endpoint: '/api/unshorten?url=<encoded>',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...corsHeaders(req, env),
          },
        },
      );
    }

    if (req.method !== 'GET') {
      return errorResponse(
        'method_not_allowed',
        'Use GET',
        405,
        req,
        env,
      );
    }

    const rawUrl = url.searchParams.get('url');
    if (!rawUrl) {
      return errorResponse(
        'missing_url',
        'Query parameter "url" is required',
        400,
        req,
        env,
      );
    }

    const validation = validateTargetUrl(rawUrl);
    if (validation.kind === 'url_too_long') {
      return errorResponse(
        'url_too_long',
        `URL must be <= ${MAX_URL_LEN} characters`,
        413,
        req,
        env,
      );
    }
    if (validation.kind === 'invalid_url') {
      return errorResponse('invalid_url', 'Cannot parse URL', 400, req, env);
    }
    if (validation.kind === 'invalid_scheme') {
      return errorResponse(
        'invalid_scheme',
        'Only http and https are supported',
        400,
        req,
        env,
      );
    }
    if (validation.kind === 'forbidden_target') {
      return errorResponse(
        'forbidden_target',
        'Localhost / private IP / link-local targets are not allowed',
        400,
        req,
        env,
      );
    }

    const result = await followRedirects(validation.url);
    const status = result.ok ? 200 : statusForError(result.error);
    return jsonResponse(result, { status }, req, env);
  },
};

function statusForError(code: ErrorCode): number {
  switch (code) {
    case 'invalid_url':
    case 'invalid_scheme':
    case 'missing_url':
    case 'forbidden_target':
      return 400;
    case 'url_too_long':
      return 413;
    case 'too_many_redirects':
      return 502;
    case 'fetch_failed':
      return 502;
    case 'timeout':
      return 504;
    case 'rate_limit':
      return 429;
    case 'method_not_allowed':
      return 405;
    case 'not_found':
      return 404;
  }
}
