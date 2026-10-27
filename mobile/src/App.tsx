import { useCallback, useEffect, useRef, useState } from "react";
import { getSetting, db, saveSnapshot, clearLocalData, prepareStore } from "./lib/db";
import { ApiError, sync, type LoginResult } from "./lib/api";
import { computeTotals, formatMoney, formatTime } from "./lib/money";
import { printOrder } from "./lib/thermal";
import { clearSession, readSession, writeSession, type Session } from "./lib/storage";
import { checkForUpdate, downloadAndInstall, APP_VERSION, type UpdateInfo } from "./lib/update";
import type {
  Category,
  Customer,
  PendingOrder,
  Product,
  Settings,
} from "./lib/types";
import { LoginScreen } from "./screens/LoginScreen";
import { StorePicker } from "./screens/StorePicker";
import { PosScreen, type CartLine } from "./screens/PosScreen";

type LocalData = {
  settings: Settings;
  products: Product[];
  categories: Category[];
  customers: Customer[];
};

async function loadLocal(): Promise<LocalData | null> {
  const settings = await getSetting();
  if (!settings) return null;
  const [products, categories, customers] = await Promise.all([
    db.products.orderBy("name").toArray(),
    db.categories.toArray(),
    db.customers.toArray(),
  ]);
  return {
    settings,
    products,
    categories: categories.sort((a, b) => a.sortOrder - b.sortOrder),
    customers,
  };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [pendingLogin, setPendingLogin] = useState<LoginResult | null>(null);
  const [data, setData] = useState<LocalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [receipt, setReceipt] = useState<PendingOrder | null>(null);
  const [view, setView] = useState<"pos" | "history" | "settings" | null>("pos");
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const syncLock = useRef(false);

  const refreshCounts = useCallback(async () => {
    const [pendingOrders, last] = await Promise.all([
      db.orders.where("status").equals("pending").count(),
      db.meta.get("lastSync"),
    ]);
    setPending(pendingOrders);
    setLastSync(last?.value ?? null);
  }, []);

  const syncNow = useCallback(
    async (activeSession?: Session) => {
      const current = activeSession ?? session;
      if (!current || !navigator.onLine || syncLock.current) return;
      syncLock.current = true;
      setSyncing(true);
      setSyncError(null);
      try {
        const pendingOrders = await db.orders.where("status").equals("pending").toArray();
        const response = await sync(current.token, pendingOrders);
        for (const result of response.results) {
          const existing = await db.orders.get(result.clientId);
          if (!existing) continue;
          const updated: PendingOrder = {
            ...existing,
            status: result.status === "rejected" ? "rejected" : "synced",
            serverOrderId: result.orderId,
            serverNumber: result.number,
            error: result.error,
          };
          await db.orders.put(updated);
          setReceipt((current) =>
            current && current.clientId === result.clientId ? updated : current,
          );
        }
        await saveSnapshot({ ...response, storeId: response.store.id });
        const fresh = await loadLocal();
        if (fresh) setData(fresh);
        const nextSession = {
          token: current.token,
          user: response.user,
          store: response.store,
        };
        await writeSession(nextSession);
        setSession(nextSession);
        setExpired(false);
        await refreshCounts();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setExpired(true);
          setSyncError("Sesi berakhir. Sambungkan internet lalu masuk ulang.");
        } else {
          setSyncError(error instanceof Error ? error.message : "Sinkronisasi gagal.");
        }
      } finally {
        syncLock.current = false;
        setSyncing(false);
      }
    },
    [session, refreshCounts],
  );

  useEffect(() => {
    async function boot() {
      const stored = await readSession();
      if (stored) {
        try {
          await prepareStore(stored.store.id);
        } catch {
          await clearSession();
          setLoading(false);
          return;
        }
      }
      const local = await loadLocal();
      setSession(stored);
      setData(local);
      setLoading(false);
      await refreshCounts();
      if (stored && local) void syncNow(stored);
    }
    void boot();
    // Mount only: boot restores the persisted session exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const timer = window.setInterval(() => {
      if (navigator.onLine) void syncNow();
    }, 45_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(timer);
    };
  }, [syncNow]);

  useEffect(() => {
    checkForUpdate()
      .then(setUpdate)
      .catch(() => undefined);
  }, []);

  async function openHistory() {
    const rows = await db.orders.orderBy("createdAt").reverse().limit(100).toArray();
    setOrders(rows);
    setView("history");
  }

  function addProduct(product: Product, note = "") {
    setCart((prev) => {
      const id = `${product.id}::${note}`;
      const inProduct = prev
        .filter((line) => line.product.id === product.id)
        .reduce((sum, line) => sum + line.qty, 0);
      if (product.stock <= 0 || inProduct >= product.stock) return prev;
      const existing = prev.find((line) => line.id === id);
      if (existing) {
        return prev.map((line) =>
          line.id === id ? { ...line, qty: line.qty + 1 } : line,
        );
      }
      return [...prev, { id, product, qty: 1, note }];
    });
  }

  function setQty(lineId: string, qty: number) {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.id !== lineId) return line;
          const others = prev
            .filter((item) => item.product.id === line.product.id && item.id !== lineId)
            .reduce((sum, item) => sum + item.qty, 0);
          const max = Math.max(1, line.product.stock - others);
          return { ...line, qty: Math.min(Math.max(1, qty), max) };
        })
        .filter((line) => line.qty > 0),
    );
  }

  function removeProduct(lineId: string) {
    setCart((prev) => prev.filter((line) => line.id !== lineId));
  }

  async function checkout(
    method: "cash" | "qris" | "card",
    amountPaid: number,
    orderType: "dine_in" | "takeaway",
    tableLabel: string,
  ) {
    if (!data) return;
    const totals = computeTotals(
      cart.map((line) => ({ unitPrice: line.product.price, qty: line.qty })),
      { taxRate: data.settings.taxRate },
    );
    const order: PendingOrder = {
      clientId: crypto.randomUUID(),
      items: cart.map((line) => ({
        productId: line.product.id,
        name: line.product.name,
        sku: line.product.sku,
        unitPrice: line.product.price,
        cost: line.product.cost,
        qty: line.qty,
        note: line.note,
      })),
      discountType: null,
      discountValue: 0,
      taxRate: data.settings.taxRate,
      ...totals,
      costTotal: cart.reduce((sum, line) => sum + line.product.cost * line.qty, 0),
      orderType,
      tableLabel: tableLabel || undefined,
      paymentMethod: method,
      amountPaid: method === "cash" ? amountPaid : totals.total,
      changeDue: (method === "cash" ? amountPaid : totals.total) - totals.total,
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    await db.orders.put(order);
    await db.transaction("rw", db.products, async () => {
      for (const line of cart) {
        await db.products.update(line.product.id, {
          stock: line.product.stock - line.qty,
        });
      }
    });
    const fresh = await loadLocal();
    if (fresh) setData(fresh);
    setCart([]);
    setReceipt(order);
    await refreshCounts();
    void syncNow();
  }

  async function logout() {
    if (pending > 0) {
      setView("settings");
      setSyncError("Sinkronkan pesanan offline dulu sebelum keluar.");
      return;
    }
    await clearSession();
    await clearLocalData();
    setSession(null);
    setData(null);
    setCart([]);
    setReceipt(null);
    setView("pos");
  }

  async function installUpdate() {
    if (!update) return;
    setUpdateError(null);
    try {
      await downloadAndInstall(update, setDownloading);
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "Gagal mengunduh.");
    } finally {
      setDownloading(null);
    }
  }

  if (loading) {
    return <div className="splash">Memuat kasir…</div>;
  }

  if (!session) {
    if (pendingLogin) {
      return (
        <StorePicker
          login={pendingLogin}
          onCancel={() => setPendingLogin(null)}
          onSelected={(next) => {
            void (async () => {
              try {
                await prepareStore(next.store.id);
              } catch (error) {
                setSyncError(
                  error instanceof Error ? error.message : "Tidak bisa pindah toko.",
                );
                return;
              }
              await writeSession(next);
              setSession(next);
              setPendingLogin(null);
              setData(await loadLocal());
              await refreshCounts();
              void syncNow(next);
            })();
          }}
        />
      );
    }
    return <LoginScreen onLogin={setPendingLogin} />;
  }

  if (!data) {
    return (
      <div className="splash">
        <h1>Data belum tersedia</h1>
        <p>Sambungkan tablet ke internet lalu sinkronkan katalog.</p>
        {syncError ? <p className="error">{syncError}</p> : null}
        <button className="primary" onClick={() => void syncNow()}>
          Sinkronkan sekarang
        </button>
        <button className="ghost" onClick={() => void logout()}>
          Keluar
        </button>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="eyebrow">{data.settings.storeName}</span>
          <strong>Kasir</strong>
        </div>
        <div className="status">
          <span className={online ? "pill online" : "pill offline"}>
            {online ? "Online" : "Offline"}
          </span>
          <span className="pill">{pending} antre</span>
          <span className="pill">v{APP_VERSION}</span>
        </div>
        <div className="top-actions">
          <button className="ghost" onClick={() => void openHistory()}>
            Riwayat
          </button>
          <button className="ghost" onClick={() => setView("settings")}>
            Pengaturan
          </button>
          <button className="ghost sync" onClick={() => void syncNow()} disabled={syncing || !online}>
            {syncing ? "Sinkron…" : "Sinkron"}
          </button>
        </div>
      </header>

      {expired ? (
        <div className="banner error-banner">
          <span>Sesi berakhir. Pesanan offline tetap aman; sambungkan internet lalu masuk ulang.</span>
          <button className="ghost" onClick={() => setSession(null)}>Masuk ulang</button>
        </div>
      ) : null}
      {update ? (
        <div className="banner">
          <span>
            Versi {update.version} tersedia dari GitHub.
          </span>
          <button className="primary small" onClick={() => void installUpdate()} disabled={downloading !== null}>
            {downloading === null ? "Unduh & pasang" : `${downloading}%`}
          </button>
        </div>
      ) : null}
      {updateError ? <div className="banner error-banner">{updateError}</div> : null}
      {syncError && !expired ? <div className="banner error-banner">{syncError}</div> : null}

      <main className="content">
        <PosScreen
          products={data.products}
          categories={data.categories}
          settings={data.settings}
          cart={cart}
          onAdd={addProduct}
          onQty={setQty}
          onRemove={removeProduct}
          onClear={() => setCart([])}
          onCheckout={(method, paid, type, table) => void checkout(method, paid, type, table)}
        />
      </main>

      {receipt ? (
        <ReceiptOverlay
          order={receipt}
          settings={data.settings}
          onClose={() => setReceipt(null)}
          onNew={() => setReceipt(null)}
        />
      ) : null}

      {view === "history" ? (
        <HistoryOverlay orders={orders} onClose={() => setView("pos")} />
      ) : null}

      {view === "settings" ? (
        <SettingsOverlay
          session={session}
          settings={data.settings}
          lastSync={lastSync}
          pending={pending}
          online={online}
          syncing={syncing}
          version={APP_VERSION}
          update={update}
          downloading={downloading}
          onSync={() => void syncNow()}
          onCheckUpdate={() =>
            checkForUpdate()
              .then(setUpdate)
              .catch(() => setUpdateError("Gagal memeriksa pembaruan."))
          }
          onInstall={() => void installUpdate()}
          onTestPrint={() => void printTest(data.settings)}
          onLogout={() => void logout()}
          onClose={() => setView("pos")}
        />
      ) : null}
    </div>
  );
}

function ReceiptOverlay({
  order,
  settings,
  onClose,
  onNew,
}: {
  order: PendingOrder;
  settings: Settings;
  onClose: () => void;
  onNew: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal receipt-modal">
        <span className="eyebrow">Pembayaran diterima</span>
        <h2>{formatMoney(order.total)}</h2>
        <p className="hint">
          {order.orderType === "takeaway" ? "Bungkus" : "Dine-in"}
          {order.tableLabel ? ` · ${order.tableLabel}` : ""} ·{" "}
          {order.serverNumber ?? "Offline"} ·{" "}
          {order.status === "pending" ? "Menunggu sinkron" : "Tersinkron"}
        </p>
        <div className="receipt-preview">
          {order.items.map((item) => (
            <div className="sum" key={item.productId}>
              <span>
                {item.qty}× {item.name}
                {item.note ? <small className="note"> · {item.note}</small> : null}
              </span>
              <span>{formatMoney(item.unitPrice * item.qty)}</span>
            </div>
          ))}
          <div className="sum total"><span>Total</span><span>{formatMoney(order.total)}</span></div>
          <div className="sum"><span>Kembali</span><span>{formatMoney(order.changeDue)}</span></div>
        </div>
        <button className="primary" onClick={() => void printOrder(order, settings)}>
          Cetak struk
        </button>
        <div className="pay-row">
          <button className="ghost" onClick={onClose}>Tutup</button>
          <button className="ghost" onClick={onNew}>Pesanan baru</button>
        </div>
      </div>
    </div>
  );
}

function HistoryOverlay({ orders, onClose }: { orders: PendingOrder[]; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <header className="sheet-head">
          <h2>Riwayat lokal</h2>
          <button className="ghost" onClick={onClose}>×</button>
        </header>
        <div className="sheet-body">
          {orders.length === 0 ? <p className="hint">Belum ada pesanan di tablet ini.</p> : null}
          {orders.map((order) => (
            <div className="history-row" key={order.clientId}>
              <div>
                <strong>{order.serverNumber ?? "OFFLINE"}</strong>
                <small>{formatTime(order.createdAt)} · {order.paymentMethod.toUpperCase()}</small>
                {order.error ? <small className="error-text">{order.error}</small> : null}
              </div>
              <div className="right">
                <strong>{formatMoney(order.total)}</strong>
                <span className={`stamp ${order.status}`}>{order.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsOverlay({
  session,
  settings,
  lastSync,
  pending,
  online,
  syncing,
  version,
  update,
  downloading,
  onSync,
  onCheckUpdate,
  onInstall,
  onTestPrint,
  onLogout,
  onClose,
}: {
  session: Session;
  settings: Settings;
  lastSync: string | null;
  pending: number;
  online: boolean;
  syncing: boolean;
  version: string;
  update: UpdateInfo | null;
  downloading: number | null;
  onSync: () => void;
  onCheckUpdate: () => void;
  onInstall: () => void;
  onTestPrint: () => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <header className="sheet-head">
          <h2>Pengaturan</h2>
          <button className="ghost" onClick={onClose}>×</button>
        </header>
        <div className="sheet-body settings-body">
          <div className="setting-card">
            <span className="eyebrow">Akun</span>
            <strong>{session.user.name}</strong>
            <p className="hint">@{session.user.username} · {session.user.role === "admin" ? "Manajemen" : "Kasir"}</p>
            <p className="hint">Toko: {session.store.name}</p>
          </div>

          <div className="setting-card">
            <span className="eyebrow">Sinkronisasi</span>
            <div className="sum"><span>Status</span><span>{online ? "Online" : "Offline"}</span></div>
            <div className="sum"><span>Menunggu</span><span>{pending} pesanan</span></div>
            <div className="sum"><span>Terakhir</span><span>{lastSync ? formatTime(lastSync) : "Belum pernah"}</span></div>
            <button className="primary" onClick={onSync} disabled={!online || syncing}>
              {syncing ? "Sinkron…" : "Sinkron sekarang"}
            </button>
            <p className="hint">
              Pesanan offline diunggah berurutan. Katalog dan stok server menimpa data lokal;
              pesanan tidak pernah dihapus.
            </p>
          </div>

          <div className="setting-card">
            <span className="eyebrow">Printer</span>
            <p className="hint">
              {settings.receiptWidth} mm. Gunakan print service printer thermal yang terpasang
              di Android (Epson, Xprinter, RawBT, Mopria).
            </p>
            <button className="ghost" onClick={onTestPrint}>Cetak tes</button>
          </div>

          <div className="setting-card">
            <span className="eyebrow">Pembaruan</span>
            <div className="sum"><span>Versi terpasang</span><span>{version}</span></div>
            <button className="ghost" onClick={onCheckUpdate}>Periksa GitHub</button>
            {update ? (
              <>
                <p className="hint">Versi {update.version} tersedia ({Math.round(update.size / 1024)} KB).</p>
                <button className="primary" onClick={onInstall} disabled={downloading !== null}>
                  {downloading === null ? "Unduh & pasang" : `Mengunduh ${downloading}%`}
                </button>
              </>
            ) : (
              <p className="hint">Tidak ada pembaruan yang lebih baru.</p>
            )}
          </div>

          <button className="ghost danger" onClick={onLogout}>Ganti toko / keluar</button>
        </div>
      </div>
    </div>
  );
}

async function printTest(settings: Settings) {
  const sample: PendingOrder = {
    clientId: "test-print",
    items: [
      {
        productId: 1,
        name: "Caffè Latte",
        sku: "TEST",
        unitPrice: 2_800_000,
        cost: 950_000,
        qty: 1,
      },
    ],
    discountType: null,
    discountValue: 0,
    taxRate: settings.taxRate,
    subtotal: 2_800_000,
    discountAmount: 0,
    taxAmount: 308_000,
    total: 3_108_000,
    costTotal: 950_000,
    orderType: "dine_in",
    tableLabel: "Meja tes",
    paymentMethod: "cash",
    amountPaid: 5_000_000,
    changeDue: 1_892_000,
    createdAt: new Date().toISOString(),
    status: "synced",
  };
  await printOrder(sample, settings);
}