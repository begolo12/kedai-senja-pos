import { useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { computeTotals, formatMoney, formatNumber, parseMoneyInput } from "../lib/money";
import type { Category, Product, Settings } from "../lib/types";

export type CartLine = { id: string; product: Product; qty: number; note: string };

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
  onAdd: (product: Product, note?: string) => void;
  onQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
  onClear: () => void;
  onCheckout: (
    method: "cash" | "qris" | "card",
    amountPaid: number,
    orderType: "dine_in" | "takeaway",
    tableLabel: string,
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<number | "all">("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [method, setMethod] = useState<"cash" | "qris" | "card">("cash");
  const [cash, setCash] = useState("");
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway">("dine_in");
  const [tableLabel, setTableLabel] = useState("");
  const [optionProduct, setOptionProduct] = useState<Product | null>(null);
  const [optionChoice, setOptionChoice] = useState("");
  const [optionNote, setOptionNote] = useState("");
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

  function chooseProduct(product: Product) {
    const choices = (product.options ?? "")
      .split(/[,;]/)
      .map((choice) => choice.trim())
      .filter(Boolean);
    if (choices.length > 0) {
      setOptionProduct(product);
      setOptionChoice(choices[0]);
      setOptionNote("");
      return;
    }
    onAdd(product);
    setQuery("");
  }

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
      chooseProduct(target);
      searchRef.current?.focus();
    }
  }

  function openPayment() {
    if (!cart.length) return;
    setCash(String(Math.ceil(totals.total / 1_000_000) * 10_000));
    setPaymentOpen(true);
  }

  function confirm() {
    onCheckout(method, paid, orderType, tableLabel);
    setPaymentOpen(false);
    setCartOpen(false);
  }

  function addWithOptions() {
    if (!optionProduct) return;
    const note = [optionChoice, optionNote.trim()].filter(Boolean).join(" · ");
    onAdd(optionProduct, note);
    setOptionProduct(null);
    setOptionNote("");
    setQuery("");
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
            const tone = categories.find((item) => item.id === product.categoryId)?.color;
            return (
              <button
                key={product.id}
                className="product"
                disabled={product.stock <= 0}
                onClick={() => chooseProduct(product)}
              >
                <span className="product-cat" style={{ background: tone ?? "var(--line)" }} />
                <span className="product-name">
                  {product.name}
                  {product.options ? <em className="option-tag">Pilihan</em> : null}
                </span>
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

        <div className="order-type">
          <button
            className={orderType === "dine_in" ? "chip active" : "chip"}
            onClick={() => setOrderType("dine_in")}
          >
            Dine-in
          </button>
          <button
            className={orderType === "takeaway" ? "chip active" : "chip"}
            onClick={() => setOrderType("takeaway")}
          >
            Bungkus
          </button>
          {orderType === "dine_in" ? (
            <input
              value={tableLabel}
              onChange={(event) => setTableLabel(event.target.value)}
              placeholder="Meja / nama"
              aria-label="Nomor meja atau nama"
            />
          ) : null}
        </div>

        <div className="ticket-lines">
          {cart.length === 0 ? (
            <p className="empty-ticket">Belum ada item. Ketuk produk untuk mulai.</p>
          ) : (
            cart.map((line) => (
              <div className="line" key={line.id}>
                <div>
                  <strong>{line.product.name}</strong>
                  <small>{formatMoney(line.product.price)}</small>
                  {line.note ? <small className="note">{line.note}</small> : null}
                  <div className="qty">
                    <button onClick={() => onQty(line.id, line.qty - 1)}>−</button>
                    <span>{line.qty}</span>
                    <button onClick={() => onQty(line.id, line.qty + 1)}>+</button>
                    <button className="remove" onClick={() => onRemove(line.id)}>
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

      {count > 0 ? (
        <button className="cartbar" onClick={() => setCartOpen(true)}>
          <span className="cartbar-info">
            <ShoppingBag />
            <span>
              <b>{count} item</b>
              <small>Lihat pesanan</small>
            </span>
          </span>
          <span className="cartbar-total">
            {formatMoney(totals.total)}
            <ArrowRight />
          </span>
        </button>
      ) : null}

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
            ) : method === "qris" ? (
              <div className="qris-box">
                {settings.qrisPayload ? (
                  settings.qrisPayload.startsWith("data:image") ? (
                    <img src={settings.qrisPayload} alt="QRIS merchant" />
                  ) : (
                    <QRCodeSVG value={settings.qrisPayload} size={180} />
                  )
                ) : (
                  <p className="hint">QRIS belum diatur di Pengaturan.</p>
                )}
                <p className="hint">Pindai, lalu konfirmasi setelah berhasil.</p>
              </div>
            ) : (
              <p className="hint">Konfirmasi setelah pembayaran kartu diterima.</p>
            )}
            <button className="primary" disabled={method === "cash" && change < 0} onClick={confirm}>
              Terima pembayaran
            </button>
          </div>
        </div>
      ) : null}

      {optionProduct ? (
        <div className="modal-backdrop" onClick={() => setOptionProduct(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <span className="eyebrow">Pilih varian</span>
            <h2>{optionProduct.name}</h2>
            <div className="methods">
              {(optionProduct.options ?? "")
                .split(/[,;]/)
                .map((choice) => choice.trim())
                .filter(Boolean)
                .map((choice) => (
                  <button
                    key={choice}
                    className={optionChoice === choice ? "chip active" : "chip"}
                    onClick={() => setOptionChoice(choice)}
                  >
                    {choice}
                  </button>
                ))}
            </div>
            <label className="cash">
              Catatan
              <input
                value={optionNote}
                onChange={(event) => setOptionNote(event.target.value)}
                placeholder="mis. tanpa timun"
                maxLength={100}
              />
            </label>
            <button className="primary" onClick={addWithOptions}>
              Tambahkan · {formatMoney(optionProduct.price)}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}