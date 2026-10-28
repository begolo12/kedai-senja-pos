import { useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight, Pause, ShoppingBag, TicketPercent, X } from "lucide-react";
import { computeTotals, formatMoney, formatNumber, parseMoneyInput } from "../lib/money";
import { dynamicQris } from "../lib/qris";
import type { Category, Customer, Product, Settings, Voucher } from "../lib/types";

export type CartLine = { id: string; product: Product; qty: number; note: string };

export type CheckoutInput = {
  method: "cash" | "qris" | "card";
  amountPaid: number;
  orderType: "dine_in" | "takeaway";
  tableLabel: string;
  customerId: number | null;
  voucherCode: string | null;
  pointsRedeem: number;
};

export type ParkedTicket = {
  id: string;
  label: string;
  cart: CartLine[];
  orderType: "dine_in" | "takeaway";
  tableLabel: string;
  customerId: number | null;
  voucherCode: string | null;
  pointsRedeem: number;
  createdAt: number;
};

export function PosScreen({
  products,
  categories,
  customers,
  vouchers,
  settings,
  cart,
  parked,
  onAdd,
  onQty,
  onRemove,
  onClear,
  onCheckout,
  onPark,
  onTakeParked,
  onDiscardParked,
  onCreateCustomer,
  restore,
}: {
  products: Product[];
  categories: Category[];
  customers: Customer[];
  vouchers: Voucher[];
  settings: Settings;
  cart: CartLine[];
  parked: ParkedTicket[];
  onAdd: (product: Product, note?: string) => void;
  onQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
  onClear: () => void;
  onCheckout: (input: CheckoutInput) => void;
  onPark: (ticket: Omit<ParkedTicket, "id" | "createdAt">) => void;
  onTakeParked: (id: string) => void;
  onDiscardParked: (id: string) => void;
  onCreateCustomer: (name: string, phone: string) => Promise<number | null>;
  restore?: {
    orderType: "dine_in" | "takeaway";
    tableLabel: string;
    customerId: number | null;
    voucherCode: string | null;
    pointsRedeem: number;
  };
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<number | "all">("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [method, setMethod] = useState<"cash" | "qris" | "card">("cash");
  const [cash, setCash] = useState("");
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway">(
    restore?.orderType ?? "dine_in",
  );
  const [tableLabel, setTableLabel] = useState(restore?.tableLabel ?? "");
  const [optionProduct, setOptionProduct] = useState<Product | null>(null);
  const [optionChoice, setOptionChoice] = useState("");
  const [optionNote, setOptionNote] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(
    restore?.customerId ?? null,
  );
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [voucherInput, setVoucherInput] = useState("");
  const [voucherCode, setVoucherCode] = useState<string | null>(
    restore?.voucherCode ?? null,
  );
  const [pointsInput, setPointsInput] = useState(
    restore?.pointsRedeem ? String(restore.pointsRedeem) : "",
  );
  const [parkOpen, setParkOpen] = useState(false);
  const [parkLabel, setParkLabel] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const customer = customers.find((entry) => entry.id === customerId) ?? null;

  const subtotal = cart.reduce(
    (sum, line) => sum + line.product.price * line.qty,
    0,
  );
  const voucher = voucherCode
    ? (vouchers.find((entry) => entry.code === voucherCode) ?? null)
    : null;
  const now = Date.now();
  const voucherValid = Boolean(
    voucher &&
      (!voucher.startsAt || new Date(voucher.startsAt).getTime() <= now) &&
      (!voucher.endsAt || new Date(voucher.endsAt).getTime() >= now) &&
      (voucher.usageLimit === 0 || voucher.usedCount < voucher.usageLimit) &&
      subtotal >= voucher.minSubtotal,
  );
  const voucherAmount = voucherValid
    ? Math.min(
        subtotal,
        voucher!.type === "percent"
          ? Math.round((subtotal * Math.min(100, Math.max(0, voucher!.value))) / 100)
          : Math.max(0, voucher!.value),
      )
    : 0;
  const pointsValue = settings.pointsValue ?? 0;
  const maxRedeemPoints =
    customer && pointsValue > 0
      ? Math.min(customer.points, Math.floor(Math.max(0, subtotal - voucherAmount) / pointsValue))
      : 0;
  const pointsRedeem = Math.min(
    maxRedeemPoints,
    Number(pointsInput.replace(/\D/g, "") || 0),
  );
  const redeemAmount = pointsRedeem * pointsValue;

  const totals = useMemo(
    () =>
      computeTotals(
        cart.map((line) => ({ unitPrice: line.product.price, qty: line.qty })),
        {
          taxRate: settings.taxRate,
          fixedDiscount: voucherAmount + redeemAmount,
        },
      ),
    [cart, settings.taxRate, voucherAmount, redeemAmount],
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

  const customerResults = customers.filter((entry) =>
    `${entry.name} ${entry.phone ?? ""}`.toLowerCase().includes(customerQuery.toLowerCase()),
  );

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
    onCheckout({
      method,
      amountPaid: paid,
      orderType,
      tableLabel,
      customerId,
      voucherCode: voucherValid ? voucherCode : null,
      pointsRedeem,
    });
    resetTicket();
    setPaymentOpen(false);
    setCartOpen(false);
  }

  function resetTicket() {
    setCustomerId(null);
    setVoucherCode(null);
    setVoucherInput("");
    setPointsInput("");
    setTableLabel("");
  }

  function applyVoucher() {
    const code = voucherInput.trim().toUpperCase();
    if (!code) {
      setVoucherCode(null);
      return;
    }
    setVoucherCode(code);
    setVoucherInput("");
  }

  function addWithOptions() {
    if (!optionProduct) return;
    const note = [optionChoice, optionNote.trim()].filter(Boolean).join(" · ");
    onAdd(optionProduct, note);
    setOptionProduct(null);
    setOptionNote("");
    setQuery("");
  }

  function submitPark(event: React.FormEvent) {
    event.preventDefault();
    if (!cart.length) return;
    onPark({
      label: parkLabel.trim() || `Tiket ${parked.length + 1}`,
      cart,
      orderType,
      tableLabel,
      customerId,
      voucherCode: voucherValid ? voucherCode : null,
      pointsRedeem,
    });
    setParkOpen(false);
    setParkLabel("");
    onClear();
    resetTicket();
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
          <div className="ticket-head-actions">
            {cart.length > 0 ? (
              <button
                className="ghost"
                onClick={() => {
                  setParkLabel(tableLabel || customer?.name || `Tiket ${parked.length + 1}`);
                  setParkOpen(true);
                }}
                aria-label="Tunda tiket"
                title="Tunda tiket"
              >
                <Pause size={16} />
              </button>
            ) : null}
            <button className="ghost" onClick={() => setCartOpen(false)} aria-label="Tutup keranjang">
              ×
            </button>
          </div>
        </header>

        {parked.length > 0 ? (
          <div className="parked-row">
            {parked.map((entry) => (
              <span key={entry.id} className="parked-chip">
                <button onClick={() => onTakeParked(entry.id)} title={`Ambil ${entry.label}`}>
                  {entry.label}
                </button>
                <button onClick={() => onDiscardParked(entry.id)} aria-label={`Buang ${entry.label}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : null}

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

        <button className="customer-row" onClick={() => setCustomerOpen(true)}>
          <span>{customer ? customer.name : "Pelanggan umum"}</span>
          {customer ? (
            <small className="hint">{customer.points} poin</small>
          ) : (
            <small className="hint">Pilih / buat baru</small>
          )}
        </button>

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

        {vouchers.length > 0 ? (
          <div className="voucher-row">
            {voucherValid && voucher ? (
              <span className="voucher-active">
                <TicketPercent size={13} />
                {voucher.code} · −{formatMoney(voucherAmount)}
                <button onClick={() => setVoucherCode(null)} aria-label="Lepas voucher">
                  <X size={12} />
                </button>
              </span>
            ) : (
              <>
                <input
                  value={voucherInput}
                  onChange={(event) =>
                    setVoucherInput(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyVoucher();
                    }
                  }}
                  placeholder="KODE VOUCHER"
                  aria-label="Kode voucher"
                  maxLength={32}
                />
                <button className="ghost" onClick={applyVoucher} disabled={!voucherInput.trim()}>
                  Pakai
                </button>
              </>
            )}
          </div>
        ) : null}

        {customer && pointsValue > 0 && customer.points > 0 ? (
          <div className="points-row">
            <span className="hint">{customer.points} poin tersedia</span>
            <input
              value={pointsInput}
              onChange={(event) =>
                setPointsInput(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              placeholder="Tukar poin"
              aria-label="Jumlah poin ditukar"
            />
            {maxRedeemPoints > 0 ? (
              <button className="ghost" onClick={() => setPointsInput(String(maxRedeemPoints))}>
                maks
              </button>
            ) : null}
          </div>
        ) : null}

        <footer className="ticket-foot">
          <div className="sum"><span>Subtotal</span><span>{formatMoney(totals.subtotal)}</span></div>
          {voucherAmount > 0 ? (
            <div className="sum discount"><span>Voucher</span><span>−{formatMoney(voucherAmount)}</span></div>
          ) : null}
          {redeemAmount > 0 ? (
            <div className="sum discount"><span>Tukar {pointsRedeem} poin</span><span>−{formatMoney(redeemAmount)}</span></div>
          ) : null}
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
                    <>
                      <QRCodeSVG
                        value={dynamicQris(settings.qrisPayload, totals.total) ?? settings.qrisPayload}
                        size={180}
                      />
                      <p className="hint">Nominal {formatMoney(totals.total)} terisi otomatis.</p>
                    </>
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

      {customerOpen ? (
        <div className="modal-backdrop" onClick={() => setCustomerOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <span className="eyebrow">Pelanggan</span>
            <input
              className="customer-search"
              value={customerQuery}
              onChange={(event) => setCustomerQuery(event.target.value)}
              placeholder="Cari nama / telepon…"
              aria-label="Cari pelanggan"
            />
            <div className="customer-list">
              <button
                onClick={() => {
                  setCustomerId(null);
                  setCustomerOpen(false);
                }}
              >
                Pelanggan umum
              </button>
              {customerResults.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => {
                    setCustomerId(entry.id);
                    setCustomerOpen(false);
                  }}
                >
                  <span>{entry.name}</span>
                  <small className="hint">{entry.phone ?? "—"} · {entry.points} poin</small>
                </button>
              ))}
              {customerResults.length === 0 ? <p className="hint">Tidak ditemukan.</p> : null}
            </div>
            <span className="eyebrow">Pelanggan baru</span>
            <label className="cash">
              Nama
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="mis. Bu Sari"
              />
            </label>
            <label className="cash">
              Telepon
              <input
                value={newPhone}
                onChange={(event) => setNewPhone(event.target.value.replace(/[^\d+\-\s]/g, ""))}
                placeholder="08…"
                inputMode="tel"
              />
            </label>
            <button
              className="primary"
              disabled={newName.trim().length < 2}
              onClick={() => {
                void (async () => {
                  const created = await onCreateCustomer(newName.trim(), newPhone.trim());
                  if (created !== null) setCustomerId(created);
                  setNewName("");
                  setNewPhone("");
                  setCustomerOpen(false);
                })();
              }}
            >
              Simpan pelanggan
            </button>
          </div>
        </div>
      ) : null}

      {parkOpen ? (
        <div className="modal-backdrop" onClick={() => setParkOpen(false)}>
          <form className="modal" onClick={(event) => event.stopPropagation()} onSubmit={submitPark}>
            <span className="eyebrow">Tunda tiket</span>
            <h2>{formatMoney(totals.total)}</h2>
            <p className="hint">
              Tiket disimpan di tablet ini dan bisa diambil kapan saja — saat pelanggan
              kembali atau rombongan bergantian bayar.
            </p>
            <label className="cash">
              Nama tiket
              <input
                value={parkLabel}
                onChange={(event) => setParkLabel(event.target.value)}
                placeholder="Meja 4 / Bu Sari"
                maxLength={40}
                autoFocus
              />
            </label>
            <button className="primary" type="submit">
              Tunda tiket
            </button>
          </form>
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
