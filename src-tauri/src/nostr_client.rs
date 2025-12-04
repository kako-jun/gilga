use nostr_sdk::prelude::*;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Nostrクライアントの状態
pub struct NostrState {
    client: Arc<RwLock<Option<Client>>>,
    keys: Arc<RwLock<Option<Keys>>>,
}

impl NostrState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(RwLock::new(None)),
            keys: Arc::new(RwLock::new(None)),
        }
    }

    /// 初期化（鍵生成 + リレー接続）
    pub async fn init(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // 鍵を自動生成（ユーザーには見せない）
        let keys = Keys::generate();

        // クライアント作成
        let client = Client::new(keys.clone());

        // リレーに接続
        let relays = vec![
            "wss://relay.damus.io",
            "wss://nos.lol",
            "wss://relay.nostr.band",
            "wss://nostr.wine",
            "wss://relay-jp.nostr.wirednet.jp",
            "wss://nostr.holybea.com",
        ];

        for relay in relays {
            client.add_relay(relay).await?;
        }

        client.connect().await;

        *self.keys.write().await = Some(keys);
        *self.client.write().await = Some(client);

        Ok(())
    }

    /// 統合ストリームを購読（kind:42 チャット + kind:1 投稿）
    pub async fn subscribe(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        // 全チャンネルのメッセージ + 全テキスト投稿
        let filter = Filter::new()
            .kinds(vec![Kind::ChannelMessage, Kind::TextNote])
            .limit(100);

        client.subscribe(filter, None).await?;

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
}

impl Default for NostrState {
    fn default() -> Self {
        Self::new()
    }
}
