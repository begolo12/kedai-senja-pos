import { useState } from "react";
import { LogIn } from "lucide-react";
import { login, type LoginResult } from "../lib/api";

export function LoginScreen({ onLogin }: { onLogin: (result: LoginResult) => void }) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(username.trim().toLowerCase(), pin);
      onLogin(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tidak bisa masuk.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-hero">
        <span className="hero-badge">Tera POS · Point of Sale</span>
        <h1>
          Antre boleh panjang.
          <br />
          <em>Semua tetap tertera.</em>
        </h1>
        <p>Kasir kafe cepat &amp; offline-first. Pesanan tersimpan lokal dan tersinkron otomatis saat online.</p>
      </div>
      <div className="login-wrap">
        <form className="login-card" onSubmit={submit}>
          <div className="login-brand">
            <img src="/logo.jpg" alt="Logo Tera POS" className="login-logo" />
            <div>
              <strong>Tera POS</strong>
              <small>Kasir Kafe</small>
            </div>
          </div>
          <h2>Selamat datang</h2>
          <p className="login-sub">Masuk dengan ID &amp; PIN staf untuk mulai berjualan.</p>
          <label>
            ID Login
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="mis. kasir"
              autoCapitalize="none"
              autoComplete="username"
              required
            />
          </label>
          <label>
            PIN / Sandi
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\s/g, "").slice(0, 64))}
              placeholder="••••••"
              type="password"
              maxLength={64}
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button className="primary btn-with-icon" disabled={busy} type="submit">
            <LogIn size={17} />
            {busy ? "Menghubungkan…" : "Masuk"}
          </button>
          <p className="hint">
            Login pertama butuh internet. Setelah itu kasir tetap bisa dipakai offline.
          </p>
        </form>
      </div>
    </div>
  );
}
