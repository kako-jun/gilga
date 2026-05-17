/**
 * Gilga ツール一覧
 *
 * MVP では 4 ツール + 「準備中」枠を表示する。
 * パスは各ツール実装時に Astro の i18n 構成上、`/ja/<slug>/` `/en/<slug>/` で動く想定。
 */

export type ToolStatus = 'ready' | 'coming-soon';

export interface Tool {
  /** URL に使う slug。`/ja/${slug}/` でリンク。null なら準備中（リンクなし） */
  slug: string | null;
  /** カードに表示する絵文字アイコン（後で SVG 差し替え予定） */
  icon: string;
  /** ステータス */
  status: ToolStatus;
}

export interface ToolCopy {
  title: string;
  description: string;
}

/** ツールの本体（順序・slug は共通） */
export const tools: Tool[] = [
  { slug: 'exif', icon: '📷', status: 'ready' },
  { slug: 'unshorten', icon: '🔗', status: 'ready' },
  { slug: 'tracker', icon: '👁️', status: 'ready' },
  { slug: 'fingerprint', icon: '🕵️', status: 'ready' },
  { slug: null, icon: '⏳', status: 'coming-soon' },
];

/** 日本語コピー（tools と同じ順序） */
export const toolsCopyJa: ToolCopy[] = [
  {
    title: '写真メタデータ除去',
    description: 'スマホ写真に埋まったGPS座標や撮影機種をブラウザ内で除去。',
  },
  {
    title: '短縮URL正体暴き',
    description: 'bit.ly や t.co の遷移先を、踏まずに安全に確認する。',
  },
  {
    title: 'トラッキングピクセル検出',
    description: 'メール HTML から開封追跡用のピクセルを暴く。',
  },
  {
    title: 'ブラウザ指紋可視化',
    description: 'あなたのブラウザがどれだけ個人特定可能かをスコア化。',
  },
  {
    title: '準備中',
    description: '次の義賊技を仕込み中。',
  },
];

/** 英語コピー（tools と同じ順序） */
export const toolsCopyEn: ToolCopy[] = [
  {
    title: 'Photo Metadata Stripper',
    description: 'Strip GPS coordinates and device info from your photos — in the browser.',
  },
  {
    title: 'URL Unshortener',
    description: 'Reveal where bit.ly or t.co really sends you, without clicking.',
  },
  {
    title: 'Tracking Pixel Detector',
    description: 'Expose the invisible pixels in marketing emails that report when you open them.',
  },
  {
    title: 'Browser Fingerprint',
    description: 'See just how uniquely identifiable your browser is.',
  },
  {
    title: 'Coming Soon',
    description: 'The next trick of the outlaw, sharpening in the dark.',
  },
];

/** ロケールごとに「カードに必要な情報」をまとめて返す */
export function getToolCards(
  lang: 'ja' | 'en',
): Array<Tool & ToolCopy & { href: string | null }> {
  const copy = lang === 'ja' ? toolsCopyJa : toolsCopyEn;
  return tools.map((tool, i) => ({
    ...tool,
    ...copy[i],
    href: tool.slug ? `/${lang}/${tool.slug}/` : null,
  }));
}
