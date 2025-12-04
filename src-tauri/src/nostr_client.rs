use directories::ProjectDirs;
use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::sync::RwLock;

/// 保存する鍵データ
#[derive(Serialize, Deserialize)]
struct StoredKeys {
    secret_key: String, // hex形式
}

/// フロントエンドに送るメッセージ
#[derive(Clone, Serialize)]
pub struct NostrMessage {
    pub id: String,
    pub pubkey: String,
    pub author: String,
    pub content: String,
    pub timestamp: i64,
    pub is_post: bool,
}

/// プロフィール情報
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct Profile {
    pub name: Option<String>,
    pub display_name: Option<String>,
    pub about: Option<String>,
    pub picture: Option<String>,
    pub website: Option<String>,
    pub nip05: Option<String>,
}

/// プロフィールキャッシュ（pubkey hex → Profile）
type ProfileCache = Arc<RwLock<HashMap<String, Profile>>>;

/// ミュートリスト（pubkey hex のセット）
type MuteList = Arc<RwLock<std::collections::HashSet<String>>>;

/// デフォルトのリレーリスト
const DEFAULT_RELAYS: &[&str] = &[
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.band",
    "wss://nostr.wine",
    "wss://relay-jp.nostr.wirednet.jp",
    "wss://nostr.holybea.com",
];

/// Nostrクライアントの状態
pub struct NostrState {
    client: Arc<RwLock<Option<Client>>>,
    keys: Arc<RwLock<Option<Keys>>>,
    event_sender: Arc<RwLock<Option<mpsc::UnboundedSender<NostrMessage>>>>,
    profiles: ProfileCache,
    muted: MuteList,
    relays: Arc<RwLock<Vec<String>>>,
}

impl NostrState {
    pub fn new() -> Self {
        // ミュートリストをファイルから読み込み
        let muted = Self::load_mute_list().unwrap_or_default();
        // リレーリストをファイルから読み込み
        let relays = Self::load_relay_list().unwrap_or_else(|| {
            DEFAULT_RELAYS.iter().map(|s| s.to_string()).collect()
        });

        Self {
            client: Arc::new(RwLock::new(None)),
            keys: Arc::new(RwLock::new(None)),
            event_sender: Arc::new(RwLock::new(None)),
            profiles: Arc::new(RwLock::new(HashMap::new())),
            muted: Arc::new(RwLock::new(muted)),
            relays: Arc::new(RwLock::new(relays)),
        }
    }

    /// リレーリストファイルのパス
    fn relay_list_path() -> Option<PathBuf> {
        Self::config_dir().map(|dir| dir.join("relays.json"))
    }

    /// リレーリストを読み込み
    fn load_relay_list() -> Option<Vec<String>> {
        let path = Self::relay_list_path()?;
        if path.exists() {
            let data = fs::read_to_string(&path).ok()?;
            serde_json::from_str(&data).ok()
        } else {
            None
        }
    }

    /// リレーリストを保存
    async fn save_relay_list(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(path) = Self::relay_list_path() {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            let relays = self.relays.read().await;
            let data = serde_json::to_string_pretty(&*relays)?;
            fs::write(&path, data)?;
        }
        Ok(())
    }

    /// リレーを追加
    pub async fn add_relay(&self, url: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        {
            let mut relays = self.relays.write().await;
            if !relays.contains(&url.to_string()) {
                relays.push(url.to_string());
            }
        }
        self.save_relay_list().await?;

        // 接続中のクライアントにも追加
        if let Some(client) = self.client.read().await.as_ref() {
            let _ = client.add_relay(url).await;
            client.connect().await;
        }
        Ok(())
    }

    /// リレーを削除
    pub async fn remove_relay(&self, url: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        {
            let mut relays = self.relays.write().await;
            relays.retain(|r| r != url);
        }
        self.save_relay_list().await?;

        // 接続中のクライアントからも削除
        if let Some(client) = self.client.read().await.as_ref() {
            let _ = client.remove_relay(url).await;
        }
        Ok(())
    }

    /// リレーリストを取得
    pub async fn get_relays(&self) -> Vec<String> {
        self.relays.read().await.clone()
    }

    /// ミュートリストファイルのパス
    fn mute_list_path() -> Option<PathBuf> {
        Self::config_dir().map(|dir| dir.join("muted.json"))
    }

    /// ミュートリストを読み込み
    fn load_mute_list() -> Option<std::collections::HashSet<String>> {
        let path = Self::mute_list_path()?;
        if path.exists() {
            let data = fs::read_to_string(&path).ok()?;
            serde_json::from_str(&data).ok()
        } else {
            None
        }
    }

    /// ミュートリストを保存
    async fn save_mute_list(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(path) = Self::mute_list_path() {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            let muted = self.muted.read().await;
            let data = serde_json::to_string_pretty(&*muted)?;
            fs::write(&path, data)?;
        }
        Ok(())
    }

    /// ユーザーをミュート
    pub async fn mute_user(&self, pubkey: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.muted.write().await.insert(pubkey.to_string());
        self.save_mute_list().await
    }

    /// ユーザーのミュートを解除
    pub async fn unmute_user(&self, pubkey: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.muted.write().await.remove(pubkey);
        self.save_mute_list().await
    }

    /// ミュートリストを取得
    pub async fn get_muted_users(&self) -> Vec<String> {
        self.muted.read().await.iter().cloned().collect()
    }

    /// ユーザーがミュートされているか確認
    pub async fn is_muted(&self, pubkey: &str) -> bool {
        self.muted.read().await.contains(pubkey)
    }

    /// スパム/bot判定
    fn is_spam(content: &str) -> bool {
        // 空メッセージ
        if content.trim().is_empty() {
            return true;
        }

        // 極端に長いメッセージ（おそらくスパム）
        if content.len() > 2000 {
            return true;
        }

        // 典型的なスパムパターン
        let spam_patterns = [
            "airdrop",
            "giveaway",
            "free btc",
            "free bitcoin",
            "claim now",
            "limited time",
            "act fast",
            "100% profit",
            "guaranteed return",
        ];

        let lower = content.to_lowercase();
        for pattern in spam_patterns {
            if lower.contains(pattern) {
                return true;
            }
        }

        // 同じ文字の連続（aaaaaaa...）
        let chars: Vec<char> = content.chars().collect();
        if chars.len() > 10 {
            let mut repeat_count = 1;
            for i in 1..chars.len() {
                if chars[i] == chars[i - 1] {
                    repeat_count += 1;
                    if repeat_count > 10 {
                        return true;
                    }
                } else {
                    repeat_count = 1;
                }
            }
        }

        false
    }

    /// pubkeyから表示名を取得（短縮形式）
    fn format_author(pubkey: &PublicKey, profiles: &HashMap<String, Profile>) -> String {
        let hex = pubkey.to_hex();

        // キャッシュにプロフィールがあれば使用
        if let Some(profile) = profiles.get(&hex) {
            if let Some(ref display_name) = profile.display_name {
                if !display_name.is_empty() {
                    return display_name.clone();
                }
            }
            if let Some(ref name) = profile.name {
                if !name.is_empty() {
                    return name.clone();
                }
            }
        }

        // プロフィールがなければ短縮npub
        let npub = pubkey.to_bech32().unwrap_or_else(|_| hex.clone());
        if npub.len() > 12 {
            format!("{}...{}", &npub[..8], &npub[npub.len()-4..])
        } else {
            npub
        }
    }

    /// イベント受信チャンネルを設定
    pub async fn set_event_sender(&self, sender: mpsc::UnboundedSender<NostrMessage>) {
        *self.event_sender.write().await = Some(sender);
    }

    /// 設定ディレクトリのパスを取得
    fn config_dir() -> Option<PathBuf> {
        ProjectDirs::from("com", "gilga", "Gilga").map(|dirs| dirs.config_dir().to_path_buf())
    }

    /// 鍵ファイルのパスを取得
    fn keys_path() -> Option<PathBuf> {
        Self::config_dir().map(|dir| dir.join("keys.json"))
    }

    /// 保存された鍵を読み込み、なければ新規生成
    fn load_or_generate_keys() -> Result<Keys, Box<dyn std::error::Error + Send + Sync>> {
        if let Some(path) = Self::keys_path() {
            if path.exists() {
                // 既存の鍵を読み込み
                let data = fs::read_to_string(&path)?;
                let stored: StoredKeys = serde_json::from_str(&data)?;
                let secret_key = SecretKey::from_hex(&stored.secret_key)?;
                let keys = Keys::new(secret_key);
                return Ok(keys);
            }
        }

        // 新規生成
        let keys = Keys::generate();

        // 保存
        if let Some(path) = Self::keys_path() {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            let stored = StoredKeys {
                secret_key: keys.secret_key().to_secret_hex(),
            };
            let data = serde_json::to_string_pretty(&stored)?;
            fs::write(&path, data)?;
        }

        Ok(keys)
    }

    /// 初期化（鍵読み込み/生成 + リレー接続）
    pub async fn init(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // 鍵を読み込み or 生成
        let keys = Self::load_or_generate_keys()?;

        // クライアント作成
        let client = Client::new(keys.clone());

        // リレーに接続（設定から読み込んだリストを使用）
        let relays = self.relays.read().await.clone();
        for relay in &relays {
            let _ = client.add_relay(relay.as_str()).await;
        }

        client.connect().await;

        *self.keys.write().await = Some(keys);
        *self.client.write().await = Some(client);

        Ok(())
    }

    /// 統合ストリームを購読（kind:42 チャット + kind:1 投稿 + kind:0 プロフィール）
    pub async fn subscribe(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        // 全チャンネルのメッセージ + 全テキスト投稿 + プロフィール
        let filter = Filter::new()
            .kinds(vec![Kind::ChannelMessage, Kind::TextNote, Kind::Metadata])
            .limit(100);

        client.subscribe(filter, None).await?;

        Ok(())
    }

    /// イベントストリームを開始（バックグラウンドでイベントを受信）
    pub async fn start_listening(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let client = self.client.read().await.clone().ok_or("Client not initialized")?;
        let sender = self.event_sender.clone();
        let profiles = self.profiles.clone();
        let muted = self.muted.clone();

        tokio::spawn(async move {
            client
                .handle_notifications(|notification| {
                    let sender = sender.clone();
                    let profiles = profiles.clone();
                    let muted = muted.clone();
                    async move {
                        if let RelayPoolNotification::Event { event, .. } = notification {
                            // ミュートされたユーザーをスキップ
                            let pubkey_hex = event.pubkey.to_hex();
                            if muted.read().await.contains(&pubkey_hex) {
                                return Ok(false);
                            }

                            // プロフィール（kind:0）の処理
                            if event.kind == Kind::Metadata {
                                if let Ok(metadata) = serde_json::from_str::<serde_json::Value>(&event.content) {
                                    let profile = Profile {
                                        name: metadata.get("name").and_then(|v| v.as_str()).map(String::from),
                                        display_name: metadata.get("display_name").and_then(|v| v.as_str()).map(String::from),
                                        about: metadata.get("about").and_then(|v| v.as_str()).map(String::from),
                                        picture: metadata.get("picture").and_then(|v| v.as_str()).map(String::from),
                                        website: metadata.get("website").and_then(|v| v.as_str()).map(String::from),
                                        nip05: metadata.get("nip05").and_then(|v| v.as_str()).map(String::from),
                                    };
                                    profiles.write().await.insert(pubkey_hex, profile);
                                }
                                return Ok(false);
                            }

                            // メッセージ（kind:1, kind:42）の処理
                            // スパムフィルタ
                            if Self::is_spam(&event.content) {
                                return Ok(false);
                            }

                            let is_post = event.kind == Kind::TextNote;
                            let profiles_guard = profiles.read().await;
                            let author = Self::format_author(&event.pubkey, &profiles_guard);
                            drop(profiles_guard);

                            let msg = NostrMessage {
                                id: event.id.to_hex(),
                                pubkey: event.pubkey.to_hex(),
                                author,
                                content: event.content.clone(),
                                timestamp: event.created_at.as_u64() as i64,
                                is_post,
                            };

                            if let Some(tx) = sender.read().await.as_ref() {
                                let _ = tx.send(msg);
                            }
                        }
                        Ok(false) // 継続
                    }
                })
                .await
        });

        Ok(())
    }

    /// メッセージ送信
    pub async fn send_message(
        &self,
        content: &str,
    ) -> Result<EventId, Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        // テキストノート（kind:1）として投稿
        let builder = EventBuilder::text_note(content);
        let output = client.send_event_builder(builder).await?;

        Ok(output.id().clone())
    }

    /// 公開鍵を取得（表示用）
    pub async fn get_public_key(&self) -> Option<String> {
        let keys_guard = self.keys.read().await;
        keys_guard.as_ref().map(|k| k.public_key().to_bech32().unwrap_or_default())
    }

    /// 秘密鍵を取得（エクスポート用、nsec形式）
    pub async fn get_secret_key(&self) -> Option<String> {
        let keys_guard = self.keys.read().await;
        keys_guard.as_ref().map(|k| k.secret_key().to_bech32().unwrap_or_default())
    }

    /// 自分のプロフィールを取得
    pub async fn get_my_profile(&self) -> Option<Profile> {
        let keys_guard = self.keys.read().await;
        let pubkey_hex = keys_guard.as_ref()?.public_key().to_hex();
        let profiles = self.profiles.read().await;
        profiles.get(&pubkey_hex).cloned()
    }

    /// プロフィールを更新（kind:0）
    pub async fn update_profile(
        &self,
        name: Option<String>,
        display_name: Option<String>,
        about: Option<String>,
        picture: Option<String>,
        website: Option<String>,
        nip05: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        // メタデータを構築
        let mut metadata = serde_json::Map::new();
        if let Some(n) = name {
            metadata.insert("name".to_string(), serde_json::Value::String(n));
        }
        if let Some(dn) = display_name {
            metadata.insert("display_name".to_string(), serde_json::Value::String(dn));
        }
        if let Some(a) = about {
            metadata.insert("about".to_string(), serde_json::Value::String(a));
        }
        if let Some(p) = picture {
            metadata.insert("picture".to_string(), serde_json::Value::String(p));
        }
        if let Some(w) = website {
            metadata.insert("website".to_string(), serde_json::Value::String(w));
        }
        if let Some(n) = nip05 {
            metadata.insert("nip05".to_string(), serde_json::Value::String(n));
        }

        let content = serde_json::to_string(&metadata)?;
        let builder = EventBuilder::new(Kind::Metadata, content);
        client.send_event_builder(builder).await?;

        Ok(())
    }

    /// 秘密鍵をインポート（nsec または hex形式）
    pub async fn import_key(&self, key_str: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let secret_key = if key_str.starts_with("nsec") {
            SecretKey::from_bech32(key_str)?
        } else {
            SecretKey::from_hex(key_str)?
        };

        let keys = Keys::new(secret_key);
        let pubkey = keys.public_key().to_bech32().unwrap_or_default();

        // ファイルに保存
        if let Some(path) = Self::keys_path() {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            let stored = StoredKeys {
                secret_key: keys.secret_key().to_secret_hex(),
            };
            let data = serde_json::to_string_pretty(&stored)?;
            fs::write(&path, data)?;
        }

        // メモリ上の鍵を更新
        *self.keys.write().await = Some(keys);

        Ok(pubkey)
    }
}

impl Default for NostrState {
    fn default() -> Self {
        Self::new()
    }
}
