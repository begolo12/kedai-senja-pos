"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronDown,
  Loader2,
  Minus,
  Pause,
  Plus,
  Search,
  ShoppingBag,
  TicketPercent,
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
import { createOpenOrderAction } from "@/lib/actions/tables";
import { QRCodeSVG } from "qrcode.react";

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
  options: string | null;
};

type Category = { id: number; name: string; color: string };
type CustomerOption = { id: number; name: string; phone: string | null; points: number };
type Line = { id: string; productId: number; qty: number; note: string };
type PaymentMethod = "cash" | "card" | "qris";
type PayMode = PaymentMethod | "split";
type SplitRow = { method: PaymentMethod; input: string };
type VoucherOption = {
  code: string;
  label: string;
  type: "percent" | "fixed";
  value: number;
  minSubtotal: number;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number;
  usedCount: number;
};
type ParkedTicket = {
  id: string;
  label: string;
  lines: Line[];
  orderType: "dine_in" | "takeaway";
  tableLabel: string;
  customerId: number | null;
  discountType: DiscountType | null;
  discountValue: number;
  voucherCode: string | null;
  pointsRedeem: number;
  createdAt: number;
};

const STORAGE_KEY = "pos.draft.v1";
const PARKED_KEY = "pos.parked.v1";

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
  qrisPayload,
  pointsValue,
  vouchers,
  tables,
}: {
  products: PosProduct[];
  categories: Category[];
  customers: CustomerOption[];
  currency: string;
  taxRate: number;
  qrisPayload: string;
  pointsValue: number;
  vouchers: VoucherOption[];
  tables: { id: number; name: string; seats: number }[];
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
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway">("dine_in");
  const [tableLabel, setTableLabel] = useState("");
  const [tableId, setTableId] = useState<number | null>(null);
  const [optionProduct, setOptionProduct] = useState<PosProduct | null>(null);
  const [optionChoice, setOptionChoice] = useState("");
  const [optionNote, setOptionNote] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [method, setMethod] = useState<PayMode>("cash");
  const [cashInput, setCashInput] = useState("");
  const [splitRows, setSplitRows] = useState<SplitRow[]>([
    { method: "cash", input: "" },
    { method: "qris", input: "" },
  ]);
  const [voucherInput, setVoucherInput] = useState("");
  const [voucher, setVoucher] = useState<VoucherOption | null>(null);
  const [pointsRedeem, setPointsRedeem] = useState(0);
  const [parked, setParked] = useState<ParkedTicket[]>([]);
  const [parkOpen, setParkOpen] = useState(false);
  const [parkLabel, setParkLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const clientId = useRef<string>(crypto.randomUUID());
  const searchRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          lines?: Line[];
          orderType?: "dine_in" | "takeaway";
          tableLabel?: string;
        };
        if (saved.orderType === "dine_in" || saved.orderType === "takeaway") {
          setOrderType(saved.orderType);
        }
        if (typeof saved.tableLabel === "string") setTableLabel(saved.tableLabel);
        if (Array.isArray(saved.lines)) {
          // Hydration-safe restore: server HTML starts empty, draft arrives after mount.
          setLines(
            saved.lines.filter(
              (line) =>
                typeof line.id === "string" &&
                Number.isInteger(line.productId) &&
                Number.isInteger(line.qty) &&
                line.qty > 0 &&
                typeof line.note === "string" &&
                byId.has(line.productId),
            ),
          );
        }
      }
      const rawParked = localStorage.getItem(PARKED_KEY);
      if (rawParked) {
        const savedParked = JSON.parse(rawParked) as ParkedTicket[];
        if (Array.isArray(savedParked)) {
          setParked(
            savedParked.filter(
              (entry) =>
                typeof entry.id === "string" &&
                typeof entry.label === "string" &&
                Array.isArray(entry.lines) &&
                entry.lines.length > 0,
            ),
          );
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(PARKED_KEY);
    }
    setHydrated(true);
    searchRef.current?.focus();
  }, [byId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    if (parked.length === 0) localStorage.removeItem(PARKED_KEY);
    else localStorage.setItem(PARKED_KEY, JSON.stringify(parked));
  }, [parked, hydrated]);


  useEffect(() => {
    if (!hydrated) return;
    if (lines.length === 0) localStorage.removeItem(STORAGE_KEY);
    else
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ lines, orderType, tableLabel }),
      );
  }, [lines, hydrated, orderType, tableLabel]);

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
  const subtotal = cart.reduce((sum, line) => sum + line.product.price * line.qty, 0);
  const rawManual =
    discountType === "percent"
      ? Math.round((subtotal * Math.min(100, Math.max(0, discountValue))) / 100)
      : discountType === "amount"
        ? Math.max(0, Math.round(discountValue))
        : 0;
  const manualDiscount = Math.min(subtotal, rawManual);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const voucherBase = Math.max(0, subtotal - manualDiscount);
  const rawVoucher = voucher
    ? voucher.type === "percent"
      ? Math.round((subtotal * Math.min(100, Math.max(0, voucher.value))) / 100)
      : Math.max(0, Math.round(voucher.value))
    : 0;
  const voucherAmount = voucher ? Math.min(voucherBase, rawVoucher) : 0;

  const redeemBase = Math.max(0, subtotal - manualDiscount - voucherAmount);
  const maxRedeemPoints =
    customer && pointsValue > 0
      ? Math.min(customer.points, Math.floor(redeemBase / pointsValue))
      : 0;
  const pointsRedeemed = Math.min(pointsRedeem, maxRedeemPoints);
  const redeemAmount = pointsRedeemed * pointsValue;

  const totals = computeTotals(
    cart.map((line) => ({ unitPrice: line.product.price, qty: line.qty })),
    {
      discountType,
      discountValue,
      fixedDiscount: voucherAmount + redeemAmount,
      taxRate,
    },
  );
  const paid = method === "cash" ? parseMoneyInput(cashInput) : totals.total;

  const splitParts = splitRows
    .map((row) => ({ method: row.method, amount: parseMoneyInput(row.input) }))
    .filter((row) => row.amount > 0);
  const splitCash = splitParts
    .filter((p) => p.method === "cash")
    .reduce((sum, p) => sum + p.amount, 0);
  const splitNonCash = splitParts
    .filter((p) => p.method !== "cash")
    .reduce((sum, p) => sum + p.amount, 0);
  const splitChange =
    splitCash > totals.total - splitNonCash ? splitCash - (totals.total - splitNonCash) : 0;
  const splitShort = splitCash + splitNonCash < totals.total;
  const splitOverflow = splitNonCash > totals.total;

  const change = method === "split" ? splitChange : paid - totals.total;

  function addLine(product: PosProduct, note = "") {
    const totalQty = lines
      .filter((line) => line.productId === product.id)
      .reduce((sum, line) => sum + line.qty, 0);
    if (product.stock <= 0 || totalQty >= product.stock) {
      toast.warning(`Stok ${product.name} tinggal ${product.stock}.`);
      return;
    }
    const id = `${product.id}::${note}`;
    setLines((prev) => {
      const existing = prev.find((line) => line.id === id);
      return existing
        ? prev.map((line) => (line.id === id ? { ...line, qty: line.qty + 1 } : line))
        : [...prev, { id, productId: product.id, qty: 1, note }];
    });
    setQuery("");
  }

  function chooseProduct(product: PosProduct) {
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
    addLine(product);
  }

  function addWithOptions() {
    if (!optionProduct) return;
    const note = [optionChoice, optionNote.trim()].filter(Boolean).join(" · ");
    addLine(optionProduct, note);
    setOptionProduct(null);
    setOptionNote("");
  }

  function setQty(lineId: string, qty: number) {
    const line = lines.find((item) => item.id === lineId);
    if (!line) return;
    const product = byId.get(line.productId);
    if (!product) return;
    const otherQty = lines
      .filter((item) => item.productId === line.productId && item.id !== lineId)
      .reduce((sum, item) => sum + item.qty, 0);
    const max = Math.max(1, product.stock - otherQty);
    const next = Math.min(Math.max(1, qty), max);
    setLines((prev) =>
      prev.map((item) => (item.id === lineId ? { ...item, qty: next } : item)),
    );
  }

  function removeLine(lineId: string) {
    setLines((prev) => prev.filter((line) => line.id !== lineId));
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
    chooseProduct(target);
  }

  function openPayment(next: PayMode) {
    if (lines.length === 0) {
      toast.error("Keranjang masih kosong.");
      return;
    }
    if (next === "split") {
      setSplitRows([
        { method: "cash", input: "" },
        { method: "qris", input: String(Math.round(totals.total / 100)) },
      ]);
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

  function applyVoucher() {
    const code = voucherInput.trim().toUpperCase();
    if (!code) {
      setVoucher(null);
      return;
    }
    const found = vouchers.find((option) => option.code === code) ?? null;
    if (!found) {
      toast.error(`Voucher ${code} tidak ditemukan.`);
      return;
    }
    const now = Date.now();
    if (found.startsAt && found.startsAt.getTime() > now) {
      toast.error(`Voucher ${code} belum berlaku.`);
      return;
    }
    if (found.endsAt && found.endsAt.getTime() < now) {
      toast.error(`Voucher ${code} sudah kedaluwarsa.`);
      return;
    }
    if (found.usageLimit > 0 && found.usedCount >= found.usageLimit) {
      toast.error(`Voucher ${code} sudah habis dipakai.`);
      return;
    }
    if (subtotal < found.minSubtotal) {
      toast.error(
        `Voucher ${code} butuh belanja minimal ${formatMoney(found.minSubtotal, currency)}.`,
      );
      return;
    }
    setVoucher(found);
    setVoucherInput("");
    toast.success(`Voucher ${code} dipakai.`);
  }

  function parkTicket() {
    if (lines.length === 0) {
      toast.error("Keranjang masih kosong.");
      return;
    }
    setParkLabel(tableLabel || customer?.name || `Tiket ${parked.length + 1}`);
    setParkOpen(true);
  }

  function confirmPark() {
    if (lines.length === 0) return;
    const entry: ParkedTicket = {
      id: crypto.randomUUID(),
      label: parkLabel.trim() || `Tiket ${parked.length + 1}`,
      lines,
      orderType,
      tableLabel,
      customerId,
      discountType,
      discountValue,
      voucherCode: voucher?.code ?? null,
      pointsRedeem,
      createdAt: Date.now(),
    };
    setParked((prev) => [...prev, entry]);
    setLines([]);
    setDiscountType(null);
    setDiscountValue(0);
    setDiscountDraft("");
    setCustomerId(null);
    setTableLabel("");
    setVoucher(null);
    setVoucherInput("");
    setPointsRedeem(0);
    setParkOpen(false);
    localStorage.removeItem(STORAGE_KEY);
    toast.success(`Tiket "${entry.label}" ditunda.`);
  }

  function takeParked(id: string) {
    const entry = parked.find((p) => p.id === id);
    if (!entry) return;
    if (lines.length > 0) {
      toast.error("Selesaikan atau tunda tiket aktif dulu.");
      return;
    }
    const validLines = entry.lines.filter((line) => byId.has(line.productId));
    if (validLines.length === 0) {
      toast.error("Produk tiket ini sudah tidak tersedia.");
      setParked((prev) => prev.filter((p) => p.id !== id));
      return;
    }
    setLines(validLines);
    setOrderType(entry.orderType);
    setTableLabel(entry.tableLabel);
    setCustomerId(entry.customerId);
    setDiscountType(entry.discountType);
    setDiscountValue(entry.discountValue);
    setDiscountDraft(
      entry.discountType
        ? String(
            entry.discountType === "amount"
              ? Math.round(entry.discountValue / 100)
              : entry.discountValue,
          )
        : "",
    );
    setVoucher(
      entry.voucherCode
        ? (vouchers.find((option) => option.code === entry.voucherCode) ?? null)
        : null,
    );
    setPointsRedeem(entry.pointsRedeem);
    setParked((prev) => prev.filter((p) => p.id !== id));
  }

  function discardParked(id: string) {
    setParked((prev) => prev.filter((p) => p.id !== id));
  }

  function openTableTab() {
    if (lines.length === 0) {
      toast.error("Keranjang masih kosong.");
      return;
    }
    startTransition(async () => {
      const result = await createOpenOrderAction({
        clientId: clientId.current,
        tableId,
        tableLabel,
        note: "",
        items: lines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
          note: line.note,
        })),
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
      setTableLabel("");
      setTableId(null);
      setVoucher(null);
      setVoucherInput("");
      setPointsRedeem(0);
      setPaymentOpen(false);
      localStorage.removeItem(STORAGE_KEY);
      toast.success(`Tagihan ${result.number} dibuka — bayar nanti di halaman Meja.`);
      router.push("/tables");
    });
  }

  function confirmPayment() {
    setError(null);
    if (method === "cash" && paid < totals.total) {
      setError("Uang diterima kurang dari total.");
      return;
    }
    if (method === "split") {
      if (splitParts.length === 0) {
        setError("Isi nominal untuk minimal satu metode pembayaran.");
        return;
      }
      if (splitOverflow) {
        setError("Total pembayaran non-tunai melebihi tagihan.");
        return;
      }
      if (splitShort) {
        setError("Total pembayaran kurang dari tagihan.");
        return;
      }
    }
    const payments =
      method === "split"
        ? splitParts
        : [{ method: method, amount: method === "cash" ? paid : totals.total }];
    startTransition(async () => {
      const result = await checkoutAction({
        clientId: clientId.current,
        items: lines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
          note: line.note,
        })),
        discountType,
        discountValue,
        orderType,
        tableLabel,
        paymentMethod: payments[0]?.method ?? "cash",
        payments,
        amountPaid: paid,
        customerId,
        pointsRedeem,
        voucherCode: voucher?.code ?? "",
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
      setTableLabel("");
      setVoucher(null);
      setVoucherInput("");
      setPointsRedeem(0);
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
                  onClick={() => chooseProduct(product)}
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
          <div className="flex items-center gap-1">
            {lines.length > 0 ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Tunda tiket"
                title="Tunda tiket (parkir)"
                onClick={parkTicket}
              >
                <Pause className="size-4" />
              </Button>
            ) : null}
            {lines.length > 0 ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Kosongkan pesanan"
                onClick={() => {
                  setLines([]);
                  setDiscountType(null);
                  setDiscountValue(0);
                  setVoucher(null);
                  setVoucherInput("");
                  setPointsRedeem(0);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>

        {parked.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 border-b border-border bg-muted/40 px-4 py-2">
            {parked.map((entry) => (
              <span
                key={entry.id}
                className="flex items-center gap-1 border border-border bg-card px-1.5 py-0.5 text-[11px]"
              >
                <button
                  type="button"
                  onClick={() => takeParked(entry.id)}
                  className="flex items-center gap-1 text-left"
                  title={`Ambil tiket ${entry.label}`}
                >
                  <Archive className="size-3 text-muted-foreground" />
                  <span className="max-w-28 truncate">{entry.label}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Buang tiket ${entry.label}`}
                  onClick={() => discardParked(entry.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-1 border-b border-border px-4 py-2">
          <button
            type="button"
            onClick={() => setOrderType("dine_in")}
            className={cn(
              "h-7 border px-2 text-[11px]",
              orderType === "dine_in"
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground",
            )}
          >
            Dine-in
          </button>
          <button
            type="button"
            onClick={() => setOrderType("takeaway")}
            className={cn(
              "h-7 border px-2 text-[11px]",
              orderType === "takeaway"
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground",
            )}
          >
            Bungkus
          </button>
          {orderType === "dine_in" ? (
            tables.length > 0 ? (
              <select
                value={tableId ?? ""}
                onChange={(event) => {
                  const next = event.target.value;
                  const table = tables.find((entry) => String(entry.id) === next);
                  setTableId(table?.id ?? null);
                  setTableLabel(table?.name ?? "");
                }}
                aria-label="Pilih meja"
                className="col-span-2 h-7 rounded-none border border-border bg-transparent px-2 text-[11px] outline-none focus:border-ring"
              >
                <option value="">Meja / nama (opsional)</option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name} · {table.seats} kursi
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={tableLabel}
                onChange={(event) => setTableLabel(event.target.value)}
                placeholder="Meja / nama (opsional)"
                aria-label="Nomor meja atau nama pelanggan"
                className="col-span-2 h-7 rounded-none border-border bg-transparent px-2 text-[11px]"
              />
            )
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
                  key={line.id}
                  className="flex gap-2 px-4 py-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-150"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{line.product.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {formatMoney(line.product.price, currency)}
                    </p>
                    {line.note ? (
                      <p className="mt-0.5 text-[11px] text-signal">{line.note}</p>
                    ) : null}
                    <div className="mt-1.5 flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Kurangi ${line.product.name}`}
                        onClick={() => setQty(line.id, line.qty - 1)}
                        className="grid size-6 place-items-center border border-border transition-colors hover:bg-muted"
                      >
                        <Minus className="size-3" />
                      </button>
                      <input
                        value={line.qty}
                        onChange={(event) => {
                          const next = Number(event.target.value.replace(/\D/g, ""));
                          if (Number.isFinite(next)) setQty(line.id, next || 1);
                        }}
                        aria-label={`Jumlah ${line.product.name}`}
                        className="h-6 w-10 border border-border bg-transparent text-center font-mono text-xs outline-none focus:border-ring"
                      />
                      <button
                        type="button"
                        aria-label={`Tambah ${line.product.name}`}
                        onClick={() => setQty(line.id, line.qty + 1)}
                        className="grid size-6 place-items-center border border-border transition-colors hover:bg-muted"
                      >
                        <Plus className="size-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Hapus ${line.product.name}`}
                        onClick={() => removeLine(line.id)}
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

          <div className="mt-2 flex items-center gap-1.5">
            <span className="flex items-center gap-1 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              <TicketPercent className="size-3" />
              Voucher
            </span>
            {voucher ? (
              <div className="ml-auto flex items-center gap-1">
                <span className="flex items-center gap-1 border border-signal/60 bg-signal/5 px-1.5 py-0.5 font-mono text-[10px] text-signal">
                  {voucher.code}
                  {voucherAmount > 0 ? ` · −${formatMoney(voucherAmount, currency)}` : ""}
                </span>
                <button
                  type="button"
                  aria-label="Lepas voucher"
                  onClick={() => setVoucher(null)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : (
              <div className="ml-auto flex items-center gap-1">
                <Input
                  value={voucherInput}
                  onChange={(event) =>
                    setVoucherInput(
                      event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyVoucher();
                    }
                  }}
                  placeholder="KODE"
                  aria-label="Kode voucher"
                  maxLength={32}
                  className="h-6 w-24 rounded-none border-border bg-transparent px-1.5 text-right font-mono text-[11px]"
                />
                <button
                  type="button"
                  onClick={applyVoucher}
                  disabled={!voucherInput.trim()}
                  className="h-6 border border-border px-2 font-mono text-[10px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:opacity-40"
                >
                  Pakai
                </button>
              </div>
            )}
          </div>

          {customer && pointsValue > 0 && customer.points > 0 ? (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Tukar poin
              </span>
              <div className="ml-auto flex items-center gap-1">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {customer.points} tersedia
                </span>
                <Input
                  value={pointsRedeem || ""}
                  onChange={(event) =>
                    setPointsRedeem(
                      Math.max(
                        0,
                        Math.min(
                          100_000,
                          Number(event.target.value.replace(/[^\d]/g, "") || 0),
                        ),
                      ),
                    )
                  }
                  inputMode="numeric"
                  placeholder="0"
                  aria-label="Jumlah poin ditukar"
                  className="h-6 w-16 rounded-none border-border bg-transparent px-1.5 text-right font-mono text-[11px]"
                />
                {maxRedeemPoints > 0 ? (
                  <button
                    type="button"
                    onClick={() => setPointsRedeem(maxRedeemPoints)}
                    className="h-6 border border-border px-2 font-mono text-[10px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                  >
                    maks
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <dl className="mt-3 space-y-1 text-[12px]">
            <div className="flex justify-between text-muted-foreground">
              <dt>Subtotal</dt>
              <dd className="font-mono tabular">{formatMoney(totals.subtotal, currency)}</dd>
            </div>
            {manualDiscount > 0 ? (
              <div className="flex justify-between text-signal">
                <dt>Diskon</dt>
                <dd className="font-mono tabular">−{formatMoney(manualDiscount, currency)}</dd>
              </div>
            ) : null}
            {voucherAmount > 0 ? (
              <div className="flex justify-between text-signal">
                <dt>Voucher {voucher?.code}</dt>
                <dd className="font-mono tabular">−{formatMoney(voucherAmount, currency)}</dd>
              </div>
            ) : null}
            {redeemAmount > 0 ? (
              <div className="flex justify-between text-signal">
                <dt>Tukar {pointsRedeemed} poin</dt>
                <dd className="font-mono tabular">−{formatMoney(redeemAmount, currency)}</dd>
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

          <div className="mt-3 grid grid-cols-4 gap-1.5">
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
            <Button
              type="button"
              onClick={() => openPayment("split")}
              disabled={lines.length === 0}
              variant="outline"
              className="h-10 flex-col gap-0 px-1 text-[11px] leading-none"
              title="Beberapa metode sekaligus"
            >
              Campur
            </Button>
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
              {method === "split"
                ? "Campuran · beberapa metode sekaligus"
                : `${METHODS.find((m) => m.value === method)?.label} · ${METHODS.find((m) => m.value === method)?.hint}`}
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

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
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
            <Button
              type="button"
              size="sm"
              variant={method === "split" ? "default" : "outline"}
              onClick={() => {
                setSplitRows([
                  { method: "cash", input: "" },
                  { method: "qris", input: String(Math.round(totals.total / 100)) },
                ]);
                setMethod("split");
                setError(null);
              }}
            >
              Campur
            </Button>
          </div>

          {method === "split" ? (
            <div className="space-y-2">
              {splitRows.map((row, index) => (
                <div
                  key={index}
                  className="flex flex-wrap items-center gap-1.5 border border-border px-2 py-1.5"
                >
                  <div className="flex gap-1">
                    {METHODS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() =>
                          setSplitRows((prev) =>
                            prev.map((r, i) => (i === index ? { ...r, method: m.value } : r)),
                          )
                        }
                        className={cn(
                          "h-7 border px-2 text-[11px]",
                          row.method === m.value
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={row.input ? formatNumber(parseMoneyInput(row.input) / 100) : ""}
                    onChange={(event) =>
                      setSplitRows((prev) =>
                        prev.map((r, i) =>
                          i === index
                            ? { ...r, input: event.target.value.replace(/[^\d]/g, "") }
                            : r,
                        ),
                      )
                    }
                    inputMode="numeric"
                    aria-label={`Nominal ${METHODS.find((m) => m.value === row.method)?.label}`}
                    className="ml-auto h-8 w-32 rounded-none border-border text-right font-mono text-sm"
                  />
                  {splitRows.length > 1 ? (
                    <button
                      type="button"
                      aria-label="Hapus baris pembayaran"
                      onClick={() => setSplitRows((prev) => prev.filter((_, i) => i !== index))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
              {splitRows.length < 4 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSplitRows((prev) => [...prev, { method: "card", input: "" }])
                  }
                >
                  <Plus /> Tambah metode
                </Button>
              ) : null}
              <div className="flex items-center justify-between border-t border-dashed pt-2 text-xs">
                <span className="text-muted-foreground">
                  Terbayar {formatMoney(splitCash + splitNonCash, currency)}
                </span>
                <span className={cn("font-mono tabular", splitChange > 0 ? "text-signal" : "")}>
                  Kembalian {formatMoney(splitChange, currency)}
                </span>
              </div>
              {qrisPayload ? null : (
                <p className="text-[11px] text-muted-foreground">
                  Nominal QRIS ditampilkan di struk; tunai mengisi sisanya.
                </p>
              )}
            </div>
          ) : method === "cash" ? (
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
          ) : method === "qris" ? (
            <div className="border border-dashed px-3 py-4 text-center">
              {qrisPayload ? (
                qrisPayload.startsWith("data:image") ? (
                  <img
                    src={qrisPayload}
                    alt="QRIS merchant"
                    className="mx-auto h-48 w-48 bg-white object-contain p-1"
                  />
                ) : (
                  <QRCodeSVG value={qrisPayload} size={190} className="mx-auto bg-white p-2" />
                )
              ) : (
                <p className="text-xs text-muted-foreground">
                  QRIS belum diatur. Unggah gambar QR dari alat/bank Anda di Pengaturan.
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Pindai dengan QR Anda di kasir, lalu konfirmasi setelah pembayaran berhasil.
              </p>
            </div>
          ) : (
            <p className="border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              Konfirmasi setelah pembayaran kartu berhasil.
            </p>
          )}

          {error ? (
            <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            onClick={confirmPayment}
            disabled={
              pending ||
              (method === "cash" && change < 0) ||
              (method === "split" &&
                (splitShort || splitOverflow || splitParts.length === 0))
            }
            className="h-11 w-full bg-signal text-signal-foreground hover:bg-signal/90"
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            Terima pembayaran
          </Button>
          {orderType === "dine_in" ? (
            <Button variant="outline" onClick={openTableTab} disabled={pending} className="w-full">
              <Pause /> Tagih nanti (meja)
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>


      <Dialog
        open={parkOpen}
        onOpenChange={(open) => {
          if (!open) setParkOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Tunda tiket</DialogTitle>
            <DialogDescription>
              Tiket disimpan di perangkat ini dan bisa diambil kapan saja — pelanggan
              kembali menambah pesanan atau rombongan bergantian bayar.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              confirmPark();
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="park-label"
                className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase"
              >
                Nama tiket
              </label>
              <Input
                id="park-label"
                value={parkLabel}
                onChange={(event) => setParkLabel(event.target.value)}
                placeholder="Meja 4 / Bu Sari"
                maxLength={40}
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {count} item · {formatMoney(totals.total, currency)}
            </p>
            <Button type="submit" className="w-full bg-signal text-signal-foreground hover:bg-signal/90">
              <Pause /> Tunda tiket
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(optionProduct)}
        onOpenChange={(open) => {
          if (!open) setOptionProduct(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">{optionProduct?.name}</DialogTitle>
            <DialogDescription>Pilih varian, tambah catatan bila perlu.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {(optionProduct?.options ?? "")
              .split(/[,;]/)
              .map((choice) => choice.trim())
              .filter(Boolean)
              .map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setOptionChoice(choice)}
                  className={cn(
                    "border px-2.5 py-1.5 text-xs",
                    optionChoice === choice
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {choice}
                </button>
              ))}
          </div>
          <Input
            value={optionNote}
            onChange={(event) => setOptionNote(event.target.value)}
            placeholder="Catatan (mis. tanpa timun)"
            maxLength={100}
          />
          <Button
            onClick={addWithOptions}
            className="h-10 bg-signal text-signal-foreground hover:bg-signal/90"
          >
            Tambahkan · {formatMoney(optionProduct?.price ?? 0, currency)}
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