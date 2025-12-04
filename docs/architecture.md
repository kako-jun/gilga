# 技術アーキテクチャ

**このドキュメントは開発者向け。ユーザーには見せない。**

## 設計原則

1. **技術を隠す** - ユーザーにNostrを意識させない
2. **統合表示** - チャットもSNSも一つのストリーム
3. **軽量常駐** - ゲーム中でも邪魔にならない
4. **摩擦ゼロ** - 開いた瞬間に使える

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| ランタイム | Tauri (Rust) |
| フロント | React + TypeScript |
| プロトコル | Nostr (NIP-01, NIP-28, NIP-07) |
| Nostr SDK | nostr-sdk (Rust) |

## 統合ストリームの仕組み

ユーザーには「一つの流れ」に見える。裏では複数のkindを購読。

```
┌─────────────────────────────────────────┐
│              統合ストリーム              │
├─────────────────────────────────────────┤
│  kind:42 (チャットメッセージ)            │
│  + kind:1 (テキスト投稿)                │
│  + kind:6 (リポスト)                    │
│  + kind:7 (リアクション) ※表示用        │
├─────────────────────────────────────────┤
│         時系列で混合して表示             │
└─────────────────────────────────────────┘
```

### 全チャンネル統合

サイロ化を防ぐため、全NIP-28チャンネルを一括購読。

```rust
// 全チャンネルのメッセージを購読
let filter = Filter::new()
    .kind(Kind::ChannelMessage)  // kind:42
    .limit(100);

// 全テキスト投稿も購読
let filter2 = Filter::new()
    .kind(Kind::TextNote)  // kind:1
    .limit(100);
```

人口が少ないうちは全部見せる。
増えたらフィルタリング機能を足す。

## ディレクトリ構造

```
gilga/
├── src-tauri/              # Rustバックエンド
│   ├── src/
│   │   ├── main.rs
│   │   ├── nostr/          # Nostr関連（ユーザーには見えない）
│   │   │   ├── client.rs   # 接続管理
│   │   │   ├── stream.rs   # 統合ストリーム
│   │   │   └── keys.rs     # 鍵管理（自動生成）
│   │   └── overlay/        # オーバーレイ制御
│   └── Cargo.toml
├── src/                    # Reactフロント
│   ├── App.tsx
│   ├── components/
│   │   ├── Stream/         # 統合ストリーム表示
│   │   ├── Overlay/        # オーバーレイUI
│   │   └── Input/          # 投稿UI
│   └── hooks/
│       └── useStream.ts    # ストリーム購読
├── docs/                   # ドキュメント
└── CLAUDE.md
```

## 鍵管理（ユーザーに見せない）

```
初回起動
    │
    ├─ 鍵ペアを自動生成
    │
    ├─ OSのキーチェーンに保存
    │
    └─ 即座に使える状態に
```

- 「秘密鍵」「公開鍵」という言葉を出さない
- 「ログイン」という概念を出さない
- ただ「開いたら使える」

上級者向けにNIP-07拡張連携は用意するが、設定の奥に隠す。

## リレー管理

### プリセットリレー

```
# グローバル
wss://relay.damus.io
wss://nos.lol
wss://relay.nostr.band
wss://nostr.wine

# 日本語圏
wss://relay-jp.nostr.wirednet.jp
wss://nostr.holybea.com
wss://nostr-relay.nokotaro.com
```

ユーザーにはリレーという概念を見せない。
「設定」→「詳細設定」→「接続先」のような深い階層に隠す。

## オーバーレイ実装

```rust
WindowBuilder::new(app, "overlay", WindowUrl::App("index.html".into()))
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .build()?;
```

- 黒背景、半透明
- 画面端に常駐
- ホットキーで表示/非表示

## パフォーマンス目標

| 指標 | 目標 |
|------|------|
| 起動〜表示 | < 1.5秒 |
| 投稿〜表示 | < 200ms |
| 常駐CPU | < 2% |
| 常駐メモリ | < 120MB |

## NIP対応（開発者向け）

| NIP | 用途 | ユーザーに見せるか |
|-----|------|-------------------|
| NIP-01 | 基本イベント | 見せない |
| NIP-07 | 拡張連携 | 設定の奥に隠す |
| NIP-28 | パブリックチャット | 見せない（チャットとして見せる） |

**Zapは実装しない。** 投げ銭乞食UIはGilgaの思想に反する。

## 互換性

他のNostrクライアントと完全互換。

- Gilgaで投稿 → Damus/Amethystで見える
- 0xchatのチャンネル → Gilgaで見える
- 独自拡張なし

ただし「Nostrと互換」とは言わない。
ユーザーには「他のアプリでも見れる」程度に伝える。
