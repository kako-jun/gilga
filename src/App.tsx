import { useState, useEffect, useRef } from "react";
import "./App.css";

interface Message {
  id: string;
  author: string;
  content: string;
  timestamp: number;
  isPost: boolean; // true = SNS投稿, false = チャット
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ダミーメッセージ（開発中）
  useEffect(() => {
    const dummyMessages: Message[] = [
      { id: "1", author: "Alice", content: "こんにちは！", timestamp: Date.now() - 5000, isPost: false },
      { id: "2", author: "Bob", content: "今日も暑いね", timestamp: Date.now() - 4000, isPost: false },
      { id: "3", author: "Carol", content: "新曲リリースしました！ https://example.com", timestamp: Date.now() - 3000, isPost: true },
      { id: "4", author: "Dave", content: "おめでとう！", timestamp: Date.now() - 2000, isPost: false },
      { id: "5", author: "Eve", content: "聴いてくる", timestamp: Date.now() - 1000, isPost: false },
    ];
    setMessages(dummyMessages);
  }, []);

  // 自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      author: "あなた",
      content: input,
      timestamp: Date.now(),
      isPost: false,
    };

    setMessages((prev) => [...prev, newMessage]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="overlay">
      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.author === "あなた" ? "mine" : ""}`}>
            {msg.isPost && <span className="post-label">[投稿]</span>}
            <span className="author">{msg.author}:</span>
            <span className="content">{msg.content}</span>
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
          placeholder="メッセージ... (Shift+Enter で送信)"
          autoFocus
        />
      </form>
    </div>
  );
}

export default App;
