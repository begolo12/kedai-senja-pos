"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addItemsToOpenOrderAction,
  cancelOpenOrderAction,
} from "@/lib/actions/tables";
import { formatMoney } from "@/lib/money";
import { computeModifierDelta, formatOptionChoice, parseOptions } from "@/lib/modifiers";
import { cn } from "@/lib/utils";

export type OpenBillProduct = {
  id: number;
  name: string;
  price: number;
  stock: number;
  options: string | null;
};

type DraftLine = {
  id: string;
  product: OpenBillProduct;
  qty: number;
  note: string;
};

export function AddItemsDialog({
  orderId,
  orderNumber,
  products,
  currency,
}: {
  orderId: number;
  orderNumber: string;
  products: OpenBillProduct[];
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [optionProduct, setOptionProduct] = useState<OpenBillProduct | null>(null);
  const [optionChoices, setOptionChoices] = useState<string[]>([]);
  const [optionNote, setOptionNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => p.stock > 0 && (!q || p.name.toLowerCase().includes(q)))
      .slice(0, 24);
  }, [products, query]);

  function addLine(product: OpenBillProduct, note = "") {
    const id = `${product.id}::${note}`;
    setLines((prev) => {
      const existing = prev.find((l) => l.id === id);
      return existing
        ? prev.map((l) => (l.id === id ? { ...l, qty: l.qty + 1 } : l))
        : [...prev, { id, product, qty: 1, note }];
    });
  }

  function pickProduct(product: OpenBillProduct) {
    const opts = parseOptions(product.options);
    if (opts.length > 0) {
      setOptionProduct(product);
      setOptionChoices([opts[0].label]);
      setOptionNote("");
      return;
    }
    addLine(product);
  }

  function submit() {
    if (lines.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await addItemsToOpenOrderAction(
        orderId,
        lines.map((l) => ({ productId: l.product.id, qty: l.qty, note: l.note })),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Item ditambahkan ke ${orderNumber}.`);
      setLines([]);
      setQuery("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setOptionProduct(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Plus /> Tambah item
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Tambah ke {orderNumber}</DialogTitle>
          <DialogDescription>
            Item susulan otomatis memotong stok dan masuk kembali ke layar dapur/barista.
          </DialogDescription>
        </DialogHeader>

        {optionProduct ? (
          <div className="space-y-3 border border-border bg-muted/30 p-3">
            <p className="font-serif text-lg">{optionProduct.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {parseOptions(optionProduct.options).map((choice) => {
                const selected = optionChoices.includes(choice.label);
                return (
                  <button
                    key={choice.label}
                    type="button"
                    onClick={() =>
                      setOptionChoices((prev) =>
                        prev.includes(choice.label)
                          ? prev.filter((item) => item !== choice.label)
                          : [...prev, choice.label],
                      )
                    }
                    className={cn(
                      "border px-2.5 py-1 text-xs",
                      selected
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {formatOptionChoice(choice, currency)}
                  </button>
                );
              })}
            </div>
            <Input
              value={optionNote}
              onChange={(e) => setOptionNote(e.target.value)}
              placeholder="Catatan (opsional)"
              maxLength={100}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOptionProduct(null)}
              >
                Batal
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-signal text-signal-foreground hover:bg-signal/90"
                onClick={() => {
                  const note = [...optionChoices, optionNote.trim()].filter(Boolean).join(" · ");
                  addLine(optionProduct, note);
                  setOptionProduct(null);
                }}
              >
                Tambahkan ·{" "}
                {formatMoney(
                  optionProduct.price +
                    computeModifierDelta(optionProduct.options, optionChoices.join(" · ")),
                  currency,
                )}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari menu tambahan…"
                className="h-9 pl-9"
              />
            </div>
            <div className="grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
              {filtered.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => pickProduct(product)}
                  className="flex items-center justify-between gap-2 border border-border bg-card px-2.5 py-2 text-left text-xs hover:border-foreground/40"
                >
                  <span className="min-w-0 truncate">{product.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {formatMoney(product.price, currency)}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {lines.length > 0 ? (
          <ul className="divide-y divide-dashed divide-border border border-border px-3">
            {lines.map((line) => (
              <li key={line.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {line.qty}× {line.product.name}
                  </p>
                  {line.note ? <p className="text-[11px] text-signal">{line.note}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular">
                    {formatMoney(
                      (line.product.price +
                        computeModifierDelta(line.product.options, line.note)) *
                        line.qty,
                      currency,
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                    aria-label={`Hapus ${line.product.name}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <Button
          type="button"
          onClick={submit}
          disabled={pending || lines.length === 0}
          className="w-full bg-signal text-signal-foreground hover:bg-signal/90"
        >
          {pending ? <Loader2 className="animate-spin" /> : null} Simpan tambahan ({lines.reduce((s, l) => s + l.qty, 0)} item)
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function CancelOrderDialog({
  orderId,
  orderNumber,
}: {
  orderId: number;
  orderNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await cancelOpenOrderAction(orderId, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Tagihan ${orderNumber} dibatalkan.`);
      setReason("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
          />
        }
      >
        <Ban /> Batalkan
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Batalkan {orderNumber}</DialogTitle>
          <DialogDescription>
            Tagihan meja ditutup sebagai batal dan seluruh stok item dikembalikan ke gudang.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={confirm} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`void-reason-${orderId}`} className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Alasan pembatalan
            </Label>
            <Textarea
              id={`void-reason-${orderId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="mis. tamu batal duduk / salah input meja"
              rows={2}
              required
            />
          </div>
          {error ? (
            <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="destructive"
            disabled={pending || reason.trim().length < 3}
            className="w-full"
          >
            {pending ? <Loader2 className="animate-spin" /> : null} Konfirmasi batalkan
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
