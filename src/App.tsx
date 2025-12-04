import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import Settings from "./Settings";
import "./App.css";

interface Message {
  id: string;
  pubkey: string;
  author: string;
  content: string;
  timestamp: number;
  is_post: boolean;
}

// タイムスタンプをフォーマット
function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // 1分以内
  if (diff < 60 * 1000) {
    return "今";
  }
  // 1時間以内
  if (diff < 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 1000))}分前`;
  }
  // 今日
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  }
  // それ以外
  return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

// URLをリンクに変換
function linkify(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      // URLの場合、リンクとして表示（ドメインのみ表示）
      let displayUrl = part;
      try {
        const url = new URL(part);
        displayUrl = url.hostname;
      } catch {
        // パースに失敗した場合はそのまま表示
      }
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer">
          {displayUrl}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [showSettings, setShowSettings] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; pubkey: string; author: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // メッセージ追加（重複除去）
  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      // 重複チェック
      if (prev.some((m) => m.id === msg.id)) {
        return prev;
      }
      // 時系列順に挿入
      const updated = [...prev, msg].sort((a, b) => a.timestamp - b.timestamp);
      // 最新100件に制限
      return updated.slice(-100);
    });
  }, []);

  // Nostr接続とイベントリスニング
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const init = async () => {
      try {
        // イベントリスナー登録
        unlisten = await listen<Message>("nostr-message", (event) => {
          addMessage(event.payload);
        });

        // Nostrに接続
        await invoke<string>("connect");
        setStatus("connected");

        // 初期メッセージを取得（ダミー）
        const msgs = await invoke<Message[]>("get_messages");
        msgs.forEach(addMessage);
      } catch (e) {
        console.error("Connection error:", e);
        setStatus("error");
      }
    };
    init();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [addMessage]);

  // 自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status !== "connected") return;

    const content = input;
    setInput("");

    try {
      // Nostrに送信
      const eventId = await invoke<string>("send_message", { content });

      // ローカルに即座に表示（楽観的UI更新）
      const newMessage: Message = {
        id: eventId,
        pubkey: "self",
        author: "あなた",
        content,
        timestamp: Math.floor(Date.now() / 1000),
        is_post: false,
      };
      setMessages((prev) => [...prev, newMessage]);
    } catch (e) {
      console.error("Send error:", e);
      // エラー時は入力を戻す
      setInput(content);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, pubkey: string, author: string) => {
    if (pubkey === "self") return; // 自分のメッセージは除外
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, pubkey, author });
  };

  const handleMute = async () => {
    if (!contextMenu) return;
    try {
      await invoke("mute_user", { pubkey: contextMenu.pubkey });
      // ミュートしたユーザーのメッセージを非表示に
      setMessages((prev) => prev.filter((m) => m.pubkey !== contextMenu.pubkey));
    } catch (e) {
      console.error("Mute error:", e);
    }
    setContextMenu(null);
  };

  return (
    <div className="overlay" onClick={() => setContextMenu(null)}>
      <div className="status-bar">
        <div className="status-left">
          {status === "connecting" && <span className="status connecting">接続中...</span>}
          {status === "connected" && <span className="status connected">● 接続済</span>}
          {status === "error" && <span className="status error">× 接続エラー</span>}
        </div>
        <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙</button>
      </div>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={handleMute}>🔇 {contextMenu.author} をミュート</button>
        </div>
      )}
      <div className="messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.pubkey === "self" ? "mine" : ""}`}
            onContextMenu={(e) => handleContextMenu(e, msg.pubkey, msg.author)}
          >
            <span className="time">{formatTime(msg.timestamp)}</span>
            {msg.is_post && <span className="post-label">[投稿]</span>}
            <span className="author">{msg.author}:</span>
            <span className="content">{linkify(msg.content)}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={status === "connected" ? "メッセージ... (Shift+Enter で送信)" : "接続を待っています..."}
          disabled={status !== "connected"}
          autoFocus
        />
      </form>
    </div>
  );
}

export default App;
