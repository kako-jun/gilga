# CLAUDE.md - Gilga 開発ガイド

## これは何か

**Gilga** = 登録不要のチャット＆SNSアプリ

ユーザーには技術を見せない。Nostrという単語すら出さない。
「開いたら使える」を実現する。

## 思想（重要）

**ルネッサンス的人間讃歌**

- 欲望を肯定する（承認欲求、金銭欲、帰属欲求）
- 技術を隠す（Nostr、NIP、リレーは見せない）
- 統合する（サイロ化せず全部一つの流れに）
- Zapは入れない（投げ銭乞食UIは思想に反する）

詳細は `docs/philosophy.md` を参照。

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| ランタイム | Tauri (Rust) |
| フロント | React + TypeScript |
| プロトコル | Nostr |
| Nostr SDK | nostr-sdk (Rust) |

## ディレクトリ構造

```
gilga/
├── src-tauri/          # Rustバックエンド
│   ├── src/
│   │   ├── main.rs
│   │   ├── nostr/      # Nostr関連
│   │   └── overlay/    # オーバーレイ制御
│   └── Cargo.toml
├── src/                # Reactフロント
│   ├── App.tsx
│   ├── components/
│   └── hooks/
├── docs/
│   ├── README.md       # ユーザー向け（Nostr非表示）
│   ├── philosophy.md   # 設計思想
│   ├── architecture.md # 技術詳細（開発者向け）
│   └── ux-design.md    # UX設計
└── CLAUDE.md           # このファイル
```

## 開発コマンド

```bash
# 開発
cargo tauri dev

# ビルド
cargo tauri build

# テスト
cargo test
```

## コア機能

### 統合ストリーム

チャット（kind:42）とSNS（kind:1）を一本の流れで表示。

```rust
// 全チャンネル + 全投稿を購読
let filters = vec![
    Filter::new().kind(Kind::ChannelMessage),  // kind:42
    Filter::new().kind(Kind::TextNote),        // kind:1
];
```

### 鍵の自動生成

初回起動時に自動生成。ユーザーに意識させない。

### オーバーレイ

ゲーム中でも邪魔にならない常駐UI。

## ホットキー

| キー | 動作 |
|------|------|
| Alt+Space | オーバーレイ表示/非表示 |
| Alt+Enter | 展開モード切替 |
| Shift+Enter | 送信 |

## 禁止事項

### ユーザーに見せないもの

- 「Nostr」
- 「公開鍵」「秘密鍵」
- 「リレー」
- 「NIP」

### 実装しないもの

- Zap（投げ銭）
- 複雑な設定画面
- チュートリアル

## ドキュメント

| ファイル | 対象 | 内容 |
|----------|------|------|
| docs/README.md | ユーザー | Nostr非表示、思想表明 |
| docs/philosophy.md | 開発者 | 設計思想の詳細 |
| docs/architecture.md | 開発者 | 技術仕様 |
| docs/ux-design.md | 開発者 | UI/UX設計 |

## リレー（プリセット）

```
wss://relay.damus.io
wss://nos.lol
wss://relay.nostr.band
wss://relay-jp.nostr.wirednet.jp
wss://nostr.holybea.com
```

ユーザーには「接続先」として深い設定に隠す。

## ライセンス

MIT
