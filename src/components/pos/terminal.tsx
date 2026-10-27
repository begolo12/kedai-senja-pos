"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  computeTotals,
  formatMoney,
  formatNumber,
  parseMoneyInput,
  type DiscountType,
} from "@/lib/money";
import { checkoutAction } from "@/lib/actions/sales";

export type PosProduct = {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  price: number;
  stock: number;
  unit: string;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
};

type Category = { id: number; name: string; color: string };
type CustomerOption = { id: number; name: string; phone: string | null; points: number };
type Line = { productId: number; qty: number };
type PaymentMethod = "cash" | "card" | "qris";

const STORAGE_KEY = "pos.draft.v1";

const METHODS: { value: PaymentMethod; label: string; hint: string }[] = [
  { value: "cash", label: "Tunai", hint: "Hitung kembalian" },
  { value: "qris", label: "QRIS", hint: "Pindai di layar" },
  { value: "card", label: "Kartu", hint: "Mesin EDC" },
];

export function PosTerminal({
  products,
  categories,
  customers,
  currency,
  taxRate,
}: {
  products: PosProduct[];
  categories: Category[];
  customers: CustomerOption[];
  currency: string;
  taxRate: number;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<number | "all">("all");
  const [discountType, setDiscountType] = useState<DiscountType | null>(null);
  const [discountValue, setDiscountValue] = useState(0);
  const [discountDraft, setDiscountDraft] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashInput, setCashInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const clientId = useRef<string>(crypto.randomUUID());
  const searchRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { lines?: Line[] };
        if (Array.isArray(saved.lines)) {
          // Hydration-safe restore: server HTML starts empty, draft arrives after mount.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setLines(
            saved.lines.filter(
              (line) =>
                Number.isInteger(line.productId) &&
                Number.isInteger(line.qty) &&
                line.qty > 0 &&
                byId.has(line.productId),
            ),
          );
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setHydrated(true);
    searchRef.current?.focus();
  }, [byId]);

  useEffect(() => {
    if (!hydrated) return;
    if (lines.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify({ lines }));
  }, [lines, hydrated]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const cart = lines.flatMap((line) => {
    const product = byId.get(line.productId);
    return product ? [{ ...line, product }] : [];
  });
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  const totals = computeTotals(
    cart.map((line) => ({ unitPrice: line.product.price, qty: line.qty })),
    { discountType, discountValue, taxRate },
  );
  const paid = method === "cash" ? parseMoneyInput(cashInput) : totals.total;
  const change = paid - totals.total;

  function addProduct(product: PosProduct) {
    if (product.stock <= 0) {
      toast.warning(`${product.name} stoknya habis.`);
      return;
    }
    const existing = lines.find((line) => line.productId === product.id);
    if (existing && existing.qty >= product.stock) {
      toast.warning(`Stok ${product.name} tinggal ${product.stock}.`);
      return;
    }
    setLines((prev) =>
      existing
        ? prev.map((line) =>
            line.productId === product.id ? { ...line, qty: line.qty + 1 } : line,
          )
        : [...prev, { productId: product.id, qty: 1 }],
    );
    setQuery("");
  }

  function setQty(productId: number, qty: number) {
    const product = byId.get(productId);
    if (!product) return;
    const next = Math.min(Math.max(1, qty), product.stock);
    setLines((prev) =>
      prev.map((line) => (line.productId === productId ? { ...line, qty: next } : line)),
    );
  }

  function removeLine(productId: number) {
    setLines((prev) => prev.filter((line) => line.productId !== productId));
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const exact = products.find(
      (p) => p.barcode?.toLowerCase() === q || p.sku.toLowerCase() === q,
    );
    const target = exact ?? filtered[0];
    if (!target) {
      toast.error("Produk tidak ditemukan.");
      return;
    }
    addProduct(target);
  }

  function openPayment(next: PaymentMethod) {
    if (lines.length === 0) {
      toast.error("Keranjang masih kosong.");
      return;
    }
    setMethod(next);
    setCashInput(
      next === "cash" ? String(Math.ceil(totals.total / 100 / 10000) * 10000) : "",
    );
    setError(null);
    setPaymentOpen(true);
  }

  function applyDiscount(type: DiscountType | null) {
    setDiscountType(type);
    if (type === null) {
      setDiscountValue(0);
      setDiscountDraft("");
      return;
    }
    const cleaned = discountDraft.replace(/[^\d]/g, "");
    setDiscountValue(
      type === "amount"
        ? Number(cleaned || 0) * 100
        : Math.min(100, Number(cleaned || 0)),
    );
  }

  function confirmPayment() {
    setError(null);
    if (method === "cash" && paid < totals.total) {
      setError("Uang diterima kurang dari total.");
      return;
    }
    startTransition(async () => {
      const result = await checkoutAction({
        clientId: clientId.current,
        items: lines.map((line) => ({ productId: line.productId, qty: line.qty })),
        discountType,
        discountValue,
        paymentMethod: method,
        amountPaid: paid,
        customerId,
        note: "",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      clientId.current = crypto.randomUUID();
      setLines([]);
      setDiscountType(null);
      setDiscountValue(0);
      setDiscountDraft("");
      setCustomerId(null);
      setPaymentOpen(false);
      localStorage.removeItem(STORAGE_KEY);
      router.push(`/receipt/${result.orderId}?fresh=1`);
    });
  }

  const cashCandidates = [
    ...new Set([
      totals.total,
      Math.ceil(totals.total / 1_000_000) * 1_000_000,
      Math.ceil(totals.total / 2_000_000) * 2_000_000,
      Math.ceil(totals.total / 5_000_000) * 5_000_000,
      Math.ceil(totals.total / 10_000_000) * 10_000_000,
    ]),
  ]
    .filter((value) => value >= totals.total)
    .slice(0, 5);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const customerResults = customers.filter((c) =>
    `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(customerQuery.toLowerCase()),
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
      <section className="min-w-0">
        <form onSubmit={submitSearch} className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari produk, SKU, atau pindai barcode…"
            aria-label="Cari produk"
            className="h-12 border-border bg-card pr-24 pl-10 text-base shadow-none"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            / cari
          </span>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <CategoryChip active={category === "all"} onClick={() => setCategory("all")}>
            Semua <span className="ml-1 font-mono text-[10px] opacity-60">{products.length}</span>
          </CategoryChip>
          {categories.map((cat) => (
            <CategoryChip
              key={cat.id}
              active={category === cat.id}
              onClick={() => setCategory(cat.id)}
              dot={cat.color}
            >
              {cat.name}
            </CategoryChip>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="mt-4 border border-dashed px-6 py-16 text-center">
            <ShoppingBag className="mx-auto size-6 text-muted-foreground" strokeWidth={1.4} />
            <p className="mt-3 font-serif text-xl">Tidak ada produk yang cocok</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Coba kata kunci lain atau ganti kategori.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((product) => {
              const inCart = lines.find((line) => line.productId === product.id)?.qty ?? 0;
              const soldOut = product.stock <= 0;
              const low = product.stock <= 5;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product)}
                  disabled={soldOut}
                  data-product-id={product.id}
                  className={cn(
                    "group relative flex min-h-[112px] flex-col justify-between border border-border bg-card p-3 text-left transition-all",
                    "hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[2px_2px_0_0_var(--border)]",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    soldOut && "cursor-not-allowed opacity-45 hover:translate-y-0 hover:shadow-none",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[13px] leading-snug font-medium">{product.name}</span>
                    {inCart > 0 ? (
                      <span className="grid size-5 shrink-0 place-items-center bg-signal font-mono text-[10px] text-signal-foreground">
                        {inCart}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-2 flex items-end justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block font-mono text-sm tabular">
                        {formatMoney(product.price, currency)}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 flex items-center gap-1 text-[10px]",
                          soldOut || low ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ background: product.categoryColor ?? "var(--muted-foreground)" }}
                        />
                        {soldOut ? "Habis" : `Sisa ${product.stock} ${product.unit}`}
                      </span>
                    </span>
                    <span className="grid size-6 place-items-center border border-border text-muted-foreground transition-colors group-hover:border-foreground group-hover:bg-foreground group-hover:text-background">
                      <Plus className="size-3.5" />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <aside
        id="ticket"
        className="sticky top-20 flex max-h-[calc(100dvh-6rem)] flex-col border border-border bg-card shadow-[3px_3px_0_0_var(--border)]"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Tiket #{String(count).padStart(2, "0")}
            </p>
            <h2 className="font-serif text-2xl leading-none">Pesanan baru</h2>
          </div>
          {lines.length > 0 ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Kosongkan pesanan"
              onClick={() => {
                setLines([]);
                setDiscountType(null);
                setDiscountValue(0);
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>

        <div className="border-b border-border px-4 py-2">
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 py-1 text-left text-[13px]"
                />
              }
            >
              <span className="flex items-center gap-2 text-muted-foreground">
                <UserRound className="size-3.5" />
                {customer ? (
                  <span className="text-foreground">
                    {customer.name}
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                      {customer.points} poin
                    </span>
                  </span>
                ) : (
                  "Pelanggan umum"
                )}
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-2">
              <Input
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
                placeholder="Cari nama atau nomor…"
                className="h-8"
              />
              <div className="max-h-56 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setCustomerId(null)}
                  className="mt-1 flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  Pelanggan umum
                  {customerId === null ? <span className="text-signal">•</span> : null}
                </button>
                {customerResults.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCustomerId(option.id)}
                    className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span>
                      {option.name}
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {option.phone ?? "—"}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {option.points}
                    </span>
                  </button>
                ))}
                {customerResults.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    Pelanggan tidak ditemukan.
                  </p>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex h-full min-h-40 flex-col items-center justify-center gap-1 px-6 py-10 text-center">
              <ShoppingBag className="size-5 text-muted-foreground" strokeWidth={1.4} />
              <p className="mt-1 font-serif text-lg">Belum ada item</p>
              <p className="text-xs text-muted-foreground">
                Klik produk di sebelah kiri untuk mulai.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-dashed divide-border">
              {cart.map((line) => (
                <li
                  key={line.productId}
                  className="flex gap-2 px-4 py-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-150"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{line.product.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {formatMoney(line.product.price, currency)}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Kurangi ${line.product.name}`}
                        onClick={() => setQty(line.productId, line.qty - 1)}
                        className="grid size-6 place-items-center border border-border transition-colors hover:bg-muted"
                      >
                        <Minus className="size-3" />
                      </button>
                      <input
                        value={line.qty}
                        onChange={(event) => {
                          const next = Number(event.target.value.replace(/\D/g, ""));
                          if (Number.isFinite(next)) setQty(line.productId, next || 1);
                        }}
                        aria-label={`Jumlah ${line.product.name}`}
                        className="h-6 w-10 border border-border bg-transparent text-center font-mono text-xs outline-none focus:border-ring"
                      />
                      <button
                        type="button"
                        aria-label={`Tambah ${line.product.name}`}
                        onClick={() => setQty(line.productId, line.qty + 1)}
                        className="grid size-6 place-items-center border border-border transition-colors hover:bg-muted"
                      >
                        <Plus className="size-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Hapus ${line.product.name}`}
                        onClick={() => removeLine(line.productId)}
                        className="ml-1 grid size-6 place-items-center text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="shrink-0 font-mono text-[13px] tabular">
                    {formatMoney(line.product.price * line.qty, currency)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              Diskon
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyDiscount(discountType === "percent" ? null : "percent")}
                className={cn(
                  "h-6 border px-2 font-mono text-[10px]",
                  discountType === "percent"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground",
                )}
              >
                %
              </button>
              <button
                type="button"
                onClick={() => applyDiscount(discountType === "amount" ? null : "amount")}
                className={cn(
                  "h-6 border px-2 font-mono text-[10px]",
                  discountType === "amount"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground",
                )}
              >
                Rp
              </button>
              <Input
                value={discountDraft}
                onChange={(event) => {
                  const next = event.target.value.replace(/[^\d]/g, "");
                  setDiscountDraft(next);
                  if (!discountType) return;
                  const value = Number(next || 0);
                  setDiscountValue(discountType === "percent" ? Math.min(100, value) : value * 100);
                }}
                disabled={!discountType}
                inputMode="numeric"
                placeholder={discountType === "percent" ? "0" : "0"}
                aria-label="Nilai diskon"
                className="h-6 w-16 rounded-none border-border bg-transparent px-1.5 text-right font-mono text-[11px] disabled:opacity-40"
              />
            </div>
          </div>

          <dl className="mt-3 space-y-1 text-[12px]">
            <div className="flex justify-between text-muted-foreground">
              <dt>Subtotal</dt>
              <dd className="font-mono tabular">{formatMoney(totals.subtotal, currency)}</dd>
            </div>
            {totals.discountAmount > 0 ? (
              <div className="flex justify-between text-signal">
                <dt>Diskon</dt>
                <dd className="font-mono tabular">−{formatMoney(totals.discountAmount, currency)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-muted-foreground">
              <dt>Pajak {(taxRate / 100).toLocaleString("id-ID")}%</dt>
              <dd className="font-mono tabular">{formatMoney(totals.taxAmount, currency)}</dd>
            </div>
          </dl>

          <div className="mt-2 flex items-end justify-between border-t border-border pt-2">
            <span className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              Total
            </span>
            <span className="font-mono text-2xl tracking-tight tabular">
              {formatMoney(totals.total, currency)}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {METHODS.map((m) => (
              <Button
                key={m.value}
                type="button"
                onClick={() => openPayment(m.value)}
                disabled={lines.length === 0}
                variant={m.value === "cash" ? "default" : "outline"}
                className="h-10 flex-col gap-0 px-1 text-[11px] leading-none"
                title={m.hint}
              >
                {m.label}
              </Button>
            ))}
          </div>
        </div>
      </aside>

      <a
        href="#ticket"
        className="fixed inset-x-3 bottom-3 z-20 flex items-center justify-between border border-foreground bg-foreground px-4 py-3 text-background shadow-lg lg:hidden"
      >
        <span className="text-xs tracking-[0.14em] uppercase">{count} item</span>
        <span className="font-mono text-sm">{formatMoney(totals.total, currency)}</span>
      </a>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Pembayaran</DialogTitle>
            <DialogDescription>
              {METHODS.find((m) => m.value === method)?.label} ·{" "}
              {METHODS.find((m) => m.value === method)?.hint}
            </DialogDescription>
          </DialogHeader>

          <div className="border border-border bg-muted/40 px-3 py-2">
            <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              Total tagihan
            </p>
            <p className="font-mono text-3xl tracking-tight tabular">
              {formatMoney(totals.total, currency)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {METHODS.map((m) => (
              <Button
                key={m.value}
                type="button"
                size="sm"
                variant={method === m.value ? "default" : "outline"}
                onClick={() => {
                  setMethod(m.value);
                  setError(null);
                }}
              >
                {m.label}
              </Button>
            ))}
          </div>

          {method === "cash" ? (
            <div className="space-y-2">
              <label
                htmlFor="cash-received"
                className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase"
              >
                Uang diterima
              </label>
              <Input
                id="cash-received"
                value={cashInput ? formatNumber(parseMoneyInput(cashInput) / 100) : ""}
                onChange={(event) => setCashInput(event.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                autoFocus
                className="input-cash h-12 rounded-none border-foreground/30 text-right font-mono text-2xl"
              />
              <div className="flex flex-wrap gap-1.5">
                {cashCandidates.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCashInput(String(value / 100))}
                    className="font-mono text-[11px]"
                  >
                    {formatMoney(value, currency)}
                  </Button>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-dashed pt-2">
                <span className="text-xs text-muted-foreground">Kembalian</span>
                <span
                  className={cn(
                    "font-mono text-xl tabular",
                    change < 0 ? "text-destructive" : "text-foreground",
                  )}
                >
                  {formatMoney(Math.max(0, change), currency)}
                </span>
              </div>
            </div>
          ) : (
            <p className="border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              Konfirmasi setelah pembayaran {method === "qris" ? "QRIS" : "kartu"} berhasil.
            </p>
          )}

          {error ? (
            <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            onClick={confirmPayment}
            disabled={pending || (method === "cash" && change < 0)}
            className="h-11 w-full bg-signal text-signal-foreground hover:bg-signal/90"
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            Terima pembayaran
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-7 items-center gap-1.5 border px-2.5 text-[11px] tracking-wide transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {dot ? <span className="size-1.5 rounded-full" style={{ background: dot }} /> : null}
      {children}
    </button>
  );
}