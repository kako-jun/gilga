use nostr_client::{NostrMessage, NostrState};
use serde::Serialize;
use std::sync::Arc;
use tauri::{Emitter, Manager, Runtime, State};
use tokio::sync::{mpsc, RwLock};

mod nostr_client;

/// フロントエンドに返すメッセージ
#[derive(Clone, Serialize)]
pub struct Message {
    id: String,
    pubkey: String,
    author: String,
    content: String,
    timestamp: i64,
    is_post: bool,
}

/// アプリケーション状態
pub struct AppState {
    nostr: Arc<NostrState>,
    messages: Arc<RwLock<Vec<Message>>>,
}

/// オーバーレイの表示/非表示を切り替え
fn toggle_overlay<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// Nostrに接続
#[tauri::command]
async fn connect(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state
        .nostr
        .init()
        .await
        .map_err(|e| format!("接続エラー: {}", e))?;

    state
        .nostr
        .subscribe()
        .await
        .map_err(|e| format!("購読エラー: {}", e))?;

    // イベント受信用チャンネルを設定
    let (tx, mut rx) = mpsc::unbounded_channel::<NostrMessage>();
    state.nostr.set_event_sender(tx).await;

    // イベントリスニング開始
    state
        .nostr
        .start_listening()
        .await
        .map_err(|e| format!("リスニングエラー: {}", e))?;

    // フロントエンドへのイベント転送タスク
    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let _ = app_handle.emit("nostr-message", msg);
        }
    });

    // 公開鍵を返す（デバッグ用）
    let pubkey = state.nostr.get_public_key().await.unwrap_or_default();
    Ok(pubkey)
}

/// メッセージを送信
#[tauri::command]
async fn send_message(content: String, state: State<'_, AppState>) -> Result<String, String> {
    let event_id = state
        .nostr
        .send_message(&content)
        .await
        .map_err(|e| format!("送信エラー: {}", e))?;

    Ok(event_id.to_hex())
}

/// メッセージ一覧を取得（現状はダミー）
#[tauri::command]
async fn get_messages(state: State<'_, AppState>) -> Result<Vec<Message>, String> {
    let messages = state.messages.read().await;
    Ok(messages.clone())
}

/// 公開鍵を取得
#[tauri::command]
async fn get_public_key(state: State<'_, AppState>) -> Result<String, String> {
    state
        .nostr
        .get_public_key()
        .await
        .ok_or_else(|| "公開鍵が見つかりません".to_string())
}

/// 秘密鍵を取得（エクスポート用）
#[tauri::command]
async fn export_secret_key(state: State<'_, AppState>) -> Result<String, String> {
    state
        .nostr
        .get_secret_key()
        .await
        .ok_or_else(|| "秘密鍵が見つかりません".to_string())
}

/// 秘密鍵をインポート
#[tauri::command]
async fn import_secret_key(key: String, state: State<'_, AppState>) -> Result<String, String> {
    state
        .nostr
        .import_key(&key)
        .await
        .map_err(|e| format!("インポートエラー: {}", e))
}

/// ユーザーをミュート
#[tauri::command]
async fn mute_user(pubkey: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .nostr
        .mute_user(&pubkey)
        .await
        .map_err(|e| format!("ミュートエラー: {}", e))
}

/// ユーザーのミュートを解除
#[tauri::command]
async fn unmute_user(pubkey: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .nostr
        .unmute_user(&pubkey)
        .await
        .map_err(|e| format!("ミュート解除エラー: {}", e))
}

/// ミュートリストを取得
#[tauri::command]
async fn get_muted_users(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.nostr.get_muted_users().await)
}

/// 自分のプロフィールを取得
#[tauri::command]
async fn get_my_profile(state: State<'_, AppState>) -> Result<Option<nostr_client::Profile>, String> {
    Ok(state.nostr.get_my_profile().await)
}

/// プロフィールを更新
#[tauri::command]
async fn update_profile(
    name: Option<String>,
    display_name: Option<String>,
    about: Option<String>,
    picture: Option<String>,
    website: Option<String>,
    nip05: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .nostr
        .update_profile(name, display_name, about, picture, website, nip05)
        .await
        .map_err(|e| format!("プロフィール更新エラー: {}", e))
}

/// リレーリストを取得
#[tauri::command]
async fn get_relays(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.nostr.get_relays().await)
}

/// リレーを追加
#[tauri::command]
async fn add_relay(url: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .nostr
        .add_relay(&url)
        .await
        .map_err(|e| format!("リレー追加エラー: {}", e))
}

/// リレーを削除
#[tauri::command]
async fn remove_relay(url: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .nostr
        .remove_relay(&url)
        .await
        .map_err(|e| format!("リレー削除エラー: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // アプリ状態を初期化
    let app_state = AppState {
        nostr: Arc::new(NostrState::new()),
        messages: Arc::new(RwLock::new(vec![])),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![connect, send_message, get_messages, get_public_key, export_secret_key, import_secret_key, mute_user, unmute_user, get_muted_users, get_my_profile, update_profile, get_relays, add_relay, remove_relay])
        .setup(|app| {
            // トレイアイコンのクリックイベントを設定
            if let Some(tray) = app.tray_by_id("main") {
                tray.on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        toggle_overlay(app);
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
