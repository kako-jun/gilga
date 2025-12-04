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
- Zapは入れない（おねだりUIは思想に反する）

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
│   │   ├── main.rs         # エントリーポイント
│   │   ├── lib.rs          # Tauriコマンド定義
│   │   └── nostr_client.rs # Nostrクライアント
│   └── Cargo.toml
├── src/                # Reactフロント
│   ├── App.tsx         # メインUI
│   ├── Settings.tsx    # 設定画面
│   └── *.css
├── docs/
│   ├── README.md       # ユーザー向け
│   ├── philosophy.md   # 設計思想
│   ├── architecture.md # 技術詳細
│   ├── ux-design.md    # UX設計
│   └── roadmap.md      # ロードマップ
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

### 鍵管理

- 初回起動時に自動生成、~/.gilga/keys.json に保存
- nsec形式でエクスポート/インポート可能

### プロフィール

- kind:0 メタデータで管理
- 名前、表示名、自己紹介、アバター、ウェブサイト、NIP-05

### ミュート

- ユーザー単位でミュート可能
- ~/.gilga/muted.json に永続化

### リレー

- 追加・削除可能
- ~/.gilga/relays.json に永続化

### オーバーレイ

ゲーム中でも邪魔にならない常駐UI。

## ホットキー

| キー | 動作 |
|------|------|
| Alt+Space | オーバーレイ表示/非表示 |
| Alt+Enter | 展開モード切替 |
| Shift+Enter | 送信 |

## 禁止事項

### 実装しないもの

- Zap（投げ銭）
- チュートリアル

### 技術用語を最小限に

設定画面では必要最低限の技術用語のみ使用。
ただし、既存Nostrユーザー向けにnsecインポートは提供。

## ドキュメント

| ファイル | 内容 |
|----------|------|
| docs/README.md | ユーザー向け説明 |
| docs/philosophy.md | 設計思想 |
| docs/architecture.md | 技術仕様 |
| docs/ux-design.md | UI/UX設計 |
| docs/roadmap.md | ロードマップ |

## Tauriコマンド一覧

| コマンド | 機能 |
|----------|------|
| connect | Nostr接続開始 |
| send_message | メッセージ送信 |
| get_messages | メッセージ取得 |
| get_public_key | 公開鍵取得 |
| export_secret_key | 秘密鍵エクスポート |
| import_secret_key | 秘密鍵インポート |
| mute_user | ユーザーミュート |
| unmute_user | ミュート解除 |
| get_muted_users | ミュートリスト取得 |
| get_my_profile | 自分のプロフィール取得 |
| update_profile | プロフィール更新 |
| get_relays | リレーリスト取得 |
| add_relay | リレー追加 |
| remove_relay | リレー削除 |

## ライセンス

MIT
