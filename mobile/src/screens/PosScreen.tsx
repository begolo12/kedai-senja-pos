import { useMemo, useRef, useState } from "react";
import { computeTotals, formatMoney, formatNumber, parseMoneyInput } from "../lib/money";
import type { Category, Product, Settings } from "../lib/types";

export type CartLine = { product: Product; qty: number };

export function PosScreen({
  products,
  categories,
  settings,
  cart,
  onAdd,
  onQty,
  onRemove,
  onClear,
  onCheckout,
}: {
  products: Product[];
  categories: Category[];
  settings: Settings;
  cart: CartLine[];
  onAdd: (product: Product) => void;
  onQty: (productId: number, qty: number) => void;
  onRemove: (productId: number) => void;
  onClear: () => void;
  onCheckout: (method: "cash" | "qris" | "card", amountPaid: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<number | "all">("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [method, setMethod] = useState<"cash" | "qris" | "card">("cash");
  const [cash, setCash] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const totals = useMemo(
    () =>
      computeTotals(
        cart.map((line) => ({ unitPrice: line.product.price, qty: line.qty })),
        { taxRate: settings.taxRate },
      ),
    [cart, settings.taxRate],
  );
  const count = cart.reduce((sum, line) => sum + line.qty, 0);
  const paid = method === "cash" ? parseMoneyInput(cash) : totals.total;
  const change = paid - totals.total;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      if (category !== "all" && product.categoryId !== category) return false;
      if (!q) return true;
      return (
        product.name.toLowerCase().includes(q) ||
        product.sku.toLowerCase().includes(q) ||
        (product.barcode ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, query, category]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const exact = products.find(
      (product) =>
        product.barcode?.toLowerCase() === q || product.sku.toLowerCase() === q,
    );
    const target = exact ?? filtered[0];
    if (target) {
      onAdd(target);
      setQuery("");
      searchRef.current?.focus();
    }
  }

  function openPayment() {
    if (!cart.length) return;
    setCash(String(Math.ceil(totals.total / 1_000_000) * 10_000));
    setPaymentOpen(true);
  }

  function confirm() {
    onCheckout(method, paid);
    setPaymentOpen(false);
    setCartOpen(false);
  }

  const cashOptions = [
    totals.total,
    Math.ceil(totals.total / 1_000_000) * 1_000_000,
    Math.ceil(totals.total / 2_000_000) * 2_000_000,
    Math.ceil(totals.total / 5_000_000) * 5_000_000,
    Math.ceil(totals.total / 10_000_000) * 10_000_000,
  ]
    .filter((value, index, all) => value >= totals.total && all.indexOf(value) === index)
    .slice(0, 4);

  return (
    <div className="pos">
      <section className="catalog">
        <form className="search" onSubmit={submitSearch}>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari produk, SKU, atau barcode…"
            aria-label="Cari produk"
          />
          <button type="submit" aria-label="Tambahkan hasil teratas">
            ↵
          </button>
        </form>

        <div className="chips">
          <button
            className={category === "all" ? "chip active" : "chip"}
            onClick={() => setCategory("all")}
          >
            Semua
          </button>
          {categories.map((item) => (
            <button
              key={item.id}
              className={category === item.id ? "chip active" : "chip"}
              onClick={() => setCategory(item.id)}
            >
              <span className="dot" style={{ background: item.color }} />
              {item.name}
            </button>
          ))}
        </div>

        <div className="product-grid">
          {filtered.map((product) => {
            const inCart = cart.find((line) => line.product.id === product.id)?.qty ?? 0;
            return (
              <button
                key={product.id}
                className="product"
                disabled={product.stock <= 0}
                onClick={() => onAdd(product)}
              >
                <span className="product-name">{product.name}</span>
                <span className="product-bottom">
                  <span>
                    <strong>{formatMoney(product.price)}</strong>
                    <small className={product.stock <= 5 ? "low" : ""}>
                      {product.stock <= 0 ? "Habis" : `Sisa ${product.stock} ${product.unit}`}
                    </small>
                  </span>
                  {inCart > 0 ? <b className="count">{inCart}</b> : <span className="plus">+</span>}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <div className="empty">Tidak ada produk yang cocok.</div>
          ) : null}
        </div>
      </section>

      <aside className={cartOpen ? "ticket open" : "ticket"}>
        <header className="ticket-head">
          <div>
            <span className="eyebrow">Tiket #{String(count).padStart(2, "0")}</span>
            <h2>Pesanan baru</h2>
          </div>
          <button className="ghost" onClick={() => setCartOpen(false)} aria-label="Tutup keranjang">
            ×
          </button>
        </header>

        <div className="ticket-lines">
          {cart.length === 0 ? (
            <p className="empty-ticket">Belum ada item. Ketuk produk untuk mulai.</p>
          ) : (
            cart.map((line) => (
              <div className="line" key={line.product.id}>
                <div>
                  <strong>{line.product.name}</strong>
                  <small>{formatMoney(line.product.price)}</small>
                  <div className="qty">
                    <button onClick={() => onQty(line.product.id, line.qty - 1)}>−</button>
                    <span>{line.qty}</span>
                    <button onClick={() => onQty(line.product.id, line.qty + 1)}>+</button>
                    <button className="remove" onClick={() => onRemove(line.product.id)}>
                      ×
                    </button>
                  </div>
                </div>
                <b>{formatMoney(line.product.price * line.qty)}</b>
              </div>
            ))
          )}
        </div>

        <footer className="ticket-foot">
          <div className="sum"><span>Subtotal</span><span>{formatMoney(totals.subtotal)}</span></div>
          <div className="sum"><span>Pajak {(settings.taxRate / 100).toLocaleString("id-ID")}%</span><span>{formatMoney(totals.taxAmount)}</span></div>
          <div className="sum total"><span>Total</span><span>{formatMoney(totals.total)}</span></div>
          <div className="pay-row">
            <button className="primary" disabled={!cart.length} onClick={openPayment}>
              Bayar
            </button>
            <button className="ghost" onClick={onClear} disabled={!cart.length} aria-label="Kosongkan">
              Kosongkan
            </button>
          </div>
        </footer>
      </aside>

      <button className="cartbar" onClick={() => setCartOpen(true)}>
        <span>{count} item</span>
        <strong>{formatMoney(totals.total)}</strong>
      </button>

      {paymentOpen ? (
        <div className="modal-backdrop" onClick={() => setPaymentOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <span className="eyebrow">Pembayaran</span>
            <h2>{formatMoney(totals.total)}</h2>
            <div className="methods">
              {(["cash", "qris", "card"] as const).map((item) => (
                <button
                  key={item}
                  className={method === item ? "chip active" : "chip"}
                  onClick={() => setMethod(item)}
                >
                  {item === "cash" ? "Tunai" : item === "qris" ? "QRIS" : "Kartu"}
                </button>
              ))}
            </div>
            {method === "cash" ? (
              <>
                <label className="cash">
                  Uang diterima
                  <input
                    value={cash ? formatNumber(parseMoneyInput(cash) / 100) : ""}
                    onChange={(event) => setCash(event.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    autoFocus
                  />
                </label>
                <div className="quick">
                  {cashOptions.map((value) => (
                    <button key={value} onClick={() => setCash(String(value / 100))}>
                      {formatMoney(value)}
                    </button>
                  ))}
                </div>
                <div className="sum total">
                  <span>Kembalian</span>
                  <span className={change < 0 ? "error-text" : ""}>{formatMoney(Math.max(0, change))}</span>
                </div>
              </>
            ) : (
              <p className="hint">Konfirmasi setelah pembayaran diterima.</p>
            )}
            <button className="primary" disabled={method === "cash" && change < 0} onClick={confirm}>
              Terima pembayaran
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}