import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./Settings.css";

interface Profile {
  name: string | null;
  display_name: string | null;
  about: string | null;
  picture: string | null;
  website: string | null;
  nip05: string | null;
}

interface SettingsProps {
  onClose: () => void;
}

export default function Settings({ onClose }: SettingsProps) {
  const [pubkey, setPubkey] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [secretKey, setSecretKey] = useState("");
  const [importKey, setImportKey] = useState("");
  const [importStatus, setImportStatus] = useState<"idle" | "success" | "error">("idle");
  const [importMessage, setImportMessage] = useState("");

  // プロフィール編集
  const [profileName, setProfileName] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileAbout, setProfileAbout] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [profileWebsite, setProfileWebsite] = useState("");
  const [profileNip05, setProfileNip05] = useState("");
  const [profileStatus, setProfileStatus] = useState<"idle" | "saving" | "success" | "error">("idle");

  // リレー管理
  const [relays, setRelays] = useState<string[]>([]);
  const [newRelay, setNewRelay] = useState("");

  useEffect(() => {
    invoke<string>("get_public_key").then(setPubkey).catch(console.error);

    // 既存のプロフィールを読み込み
    invoke<Profile | null>("get_my_profile").then((profile) => {
      if (profile) {
        setProfileName(profile.name || "");
        setProfileDisplayName(profile.display_name || "");
        setProfileAbout(profile.about || "");
        setProfilePicture(profile.picture || "");
        setProfileWebsite(profile.website || "");
        setProfileNip05(profile.nip05 || "");
      }
    }).catch(console.error);

    // リレーリストを読み込み
    invoke<string[]>("get_relays").then(setRelays).catch(console.error);
  }, []);

  const handleExport = async () => {
    if (showSecretKey) {
      setShowSecretKey(false);
      setSecretKey("");
      return;
    }
    try {
      const key = await invoke<string>("export_secret_key");
      setSecretKey(key);
      setShowSecretKey(true);
    } catch (e) {
      console.error("Export error:", e);
    }
  };

  const handleImport = async () => {
    if (!importKey.trim()) return;

    try {
      const newPubkey = await invoke<string>("import_secret_key", { key: importKey.trim() });
      setPubkey(newPubkey);
      setImportKey("");
      setImportStatus("success");
      setImportMessage("インポート成功！再起動してください");
    } catch (e) {
      setImportStatus("error");
      setImportMessage(String(e));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleSaveProfile = async () => {
    setProfileStatus("saving");
    try {
      await invoke("update_profile", {
        name: profileName || null,
        displayName: profileDisplayName || null,
        about: profileAbout || null,
        picture: profilePicture || null,
        website: profileWebsite || null,
        nip05: profileNip05 || null,
      });
      setProfileStatus("success");
      setTimeout(() => setProfileStatus("idle"), 2000);
    } catch (e) {
      console.error("Profile update error:", e);
      setProfileStatus("error");
    }
  };

  const handleAddRelay = async () => {
    if (!newRelay.trim()) return;
    let url = newRelay.trim();
    if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
      url = "wss://" + url;
    }
    try {
      await invoke("add_relay", { url });
      setRelays([...relays, url]);
      setNewRelay("");
    } catch (e) {
      console.error("Add relay error:", e);
    }
  };

  const handleRemoveRelay = async (url: string) => {
    try {
      await invoke("remove_relay", { url });
      setRelays(relays.filter((r) => r !== url));
    } catch (e) {
      console.error("Remove relay error:", e);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>設定</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-content">
          <section>
            <h3>あなたの識別子</h3>
            <p className="hint">他のアプリでも使える公開鍵です</p>
            <code className="pubkey" onClick={() => copyToClipboard(pubkey)}>
              {pubkey || "読み込み中..."}
            </code>
            <p className="copy-hint">クリックでコピー</p>
          </section>

          <section>
            <h3>鍵の管理</h3>
            <p className="hint warning">秘密鍵は絶対に他人に見せないでください</p>

            <button className="action-btn" onClick={handleExport}>
              {showSecretKey ? "隠す" : "秘密鍵を表示"}
            </button>

            {showSecretKey && (
              <div className="secret-key-box">
                <code className="secret-key" onClick={() => copyToClipboard(secretKey)}>
                  {secretKey}
                </code>
                <p className="copy-hint">クリックでコピー</p>
              </div>
            )}

            <div className="import-section">
              <p className="hint">既存の鍵をインポート（nsec形式）</p>
              <input
                type="password"
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
                placeholder="nsec1..."
                className="import-input"
              />
              <button className="action-btn" onClick={handleImport} disabled={!importKey.trim()}>
                インポート
              </button>
              {importStatus !== "idle" && (
                <p className={`import-status ${importStatus}`}>{importMessage}</p>
              )}
            </div>
          </section>

          <section>
            <h3>プロフィール</h3>
            <p className="hint">他のユーザーに表示される情報</p>
            <div className="profile-form">
              <label>
                <span>ユーザー名</span>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="alice"
                />
              </label>
              <label>
                <span>表示名</span>
                <input
                  type="text"
                  value={profileDisplayName}
                  onChange={(e) => setProfileDisplayName(e.target.value)}
                  placeholder="アリス"
                />
              </label>
              <label>
                <span>自己紹介</span>
                <textarea
                  value={profileAbout}
                  onChange={(e) => setProfileAbout(e.target.value)}
                  placeholder="よろしく！"
                  rows={2}
                />
              </label>
              <label>
                <span>アバター（画像URL）</span>
                <input
                  type="text"
                  value={profilePicture}
                  onChange={(e) => setProfilePicture(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                />
              </label>
              <label>
                <span>ウェブサイト / X など</span>
                <input
                  type="text"
                  value={profileWebsite}
                  onChange={(e) => setProfileWebsite(e.target.value)}
                  placeholder="https://x.com/yourname"
                />
              </label>
              <label>
                <span>NIP-05 認証</span>
                <input
                  type="text"
                  value={profileNip05}
                  onChange={(e) => setProfileNip05(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <button
                className="action-btn"
                onClick={handleSaveProfile}
                disabled={profileStatus === "saving"}
              >
                {profileStatus === "saving" ? "保存中..." : profileStatus === "success" ? "✓ 保存完了" : "プロフィールを保存"}
              </button>
            </div>
          </section>

          <section>
            <h3>接続先リレー</h3>
            <p className="hint">メッセージを送受信するサーバー</p>
            <ul className="relay-list">
              {relays.map((relay) => (
                <li key={relay}>
                  <span>{relay.replace("wss://", "")}</span>
                  <button className="remove-btn" onClick={() => handleRemoveRelay(relay)}>×</button>
                </li>
              ))}
            </ul>
            <div className="add-relay">
              <input
                type="text"
                value={newRelay}
                onChange={(e) => setNewRelay(e.target.value)}
                placeholder="relay.example.com"
                onKeyDown={(e) => e.key === "Enter" && handleAddRelay()}
              />
              <button className="action-btn" onClick={handleAddRelay} disabled={!newRelay.trim()}>
                追加
              </button>
            </div>
          </section>

          <section>
            <h3>バージョン</h3>
            <p>gilga v0.1.0</p>
          </section>
        </div>
      </div>
    </div>
  );
}
