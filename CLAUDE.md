# CLAUDE.md - Gilga 開発ガイド

## これは何か

**Gilga** = 悪意から弱い人を守る義賊ブランド。

知識の非対称で搾取される人を、無料で技術を使って助ける。
ストーカーウェア、詐欺、ダークパターン、デジタル遺品などの領域を扱う。

アイコンは「悪意を舐めて見破る舌」。

## 設計方針

- **UGC なし** — 投稿・コメント等のユーザ生成コンテンツは扱わない
- **中継・プロキシなし** — トラフィックを預からない
- **ファイル共有なし** — ストレージサービスはやらない
- **CF 無料枠で動く** — Cloudflare Pages 静的配信で完結する範囲に絞る
- **AI 生成 + 人間レビュー** — 静的コンテンツは AI で量産し、人間が公開前に確認

## 技術スタック

- Astro 5 + TypeScript + Tailwind CSS
- Cloudflare Pages（無料枠、別 Issue #8 で配線）
- i18n: ja / en（prefixDefaultLocale: true、'/' → '/ja/'）

## ディレクトリ構造

```
gilga/
├── astro.config.mjs    # サイトURL、i18n、redirects
├── tailwind.config.mjs
├── tsconfig.json       # @/* パスエイリアス
├── package.json        # pnpm 管理
├── pnpm-workspace.yaml # esbuild/sharp の build script 許可
├── src/
│   ├── layouts/
│   │   └── Layout.astro    # 黒背景 + 白文字の最小スケルトン
│   └── pages/
│       ├── ja/index.astro  # 日本語トップ
│       └── en/index.astro  # 英語トップ
└── CLAUDE.md           # このファイル
```

## 開発コマンド

```bash
pnpm install        # 依存導入
pnpm dev            # http://localhost:4321
pnpm build          # astro check + astro build
pnpm preview        # ビルド後プレビュー
pnpm format         # prettier --write
```

## 旧構成について

session452 までは Nostr クライアント (Tauri + React) として動いていたが、
2026-04-11 に役割を終了し、本ブランドへ転換した。旧コードは履歴に残るのみで
復活させない。

## 関連メモ

- 詳細構想・ターゲット領域・ブランドストーリーは
  `repos/private/notes/.agasteer/notes/dev/gilga.md` を参照
- ファミリープロジェクト: osaka-kenpo（法律）、know-it-break-it（表現）、
  break-and-shift（確率）

## ライセンス

MIT
