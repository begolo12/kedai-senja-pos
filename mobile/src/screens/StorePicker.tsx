import { useState } from "react";
import { selectStore, type LoginResult } from "../lib/api";
import type { Session } from "../lib/storage";

export function StorePicker({
  login,
  onSelected,
  onCancel,
}: {
  login: LoginResult;
  onSelected: (session: Session) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(storeId: number) {
    setBusy(storeId);
    setError(null);
    try {
      const result = await selectStore(login.pendingToken, storeId);
      onSelected(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tidak bisa membuka toko.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="store-picker">
      <header className="store-head">
        <span className="eyebrow">Masuk sebagai {login.user.name}</span>
        <h1>Pilih toko</h1>
        <p>Kasir dan data akan mengikuti toko yang dipilih.</p>
      </header>

      {login.stores.length === 0 ? (
        <div className="empty-store">
          <h2>Belum ada toko</h2>
          <p>Minta manajemen menugaskan akun ini ke toko.</p>
        </div>
      ) : (
        <div className="store-grid">
          {login.stores.map((store) => (
            <button
              key={store.id}
              className="store-card"
              disabled={busy !== null}
              onClick={() => void pick(store.id)}
            >
              <span className="eyebrow">{store.code}</span>
              <strong>{store.name}</strong>
              <small>{store.address || "Alamat belum diisi"}</small>
              <span className="store-open">
                {busy === store.id ? "Membuka…" : "Buka toko →"}
              </span>
            </button>
          ))}
        </div>
      )}

      {error ? <p className="error">{error}</p> : null}
      <button className="ghost picker-back" onClick={onCancel}>
        Kembali ke login
      </button>
    </div>
  );
}
