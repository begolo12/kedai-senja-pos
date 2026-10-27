import { useState } from "react";
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
        <span className="eyebrow">Kedai Senja · POS</span>
        <h1>
          Senja selalu ramai.
          <br />
          <em>Kasirnya tenang.</em>
        </h1>
        <p>Tablet kasir. Data tersimpan lokal, tersinkron saat online.</p>
      </div>
      <form className="login-card" onSubmit={submit}>
        <span className="eyebrow">Masuk</span>
        <h2>Selamat datang</h2>
        <label>
          ID Login
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoCapitalize="none"
            autoComplete="username"
            required
          />
        </label>
        <label>
          PIN
          <input
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="primary" disabled={busy} type="submit">
          {busy ? "Menghubungkan…" : "Masuk"}
        </button>
        <p className="hint">
          Login pertama butuh internet. Setelah itu kasir tetap bisa dipakai offline.
        </p>
      </form>
    </div>
  );
}