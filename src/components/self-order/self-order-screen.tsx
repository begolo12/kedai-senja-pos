"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export type SelfOrderProduct = {
  id: number;
  name: string;
  price: number;
  unit: string;
  options: string | null;
  categoryId: number | null;
};

export type SelfOrderCategory = { id: number; name: string; color: string };

type Line = { id: string; product: SelfOrderProduct; qty: number; note: string };

export function SelfOrderScreen({
  storeCode,
  storeName,
  tableId,
  tableName,
  products,
  categories,
  currency,
}: {
  storeCode: string;
  storeName: string;
  tableId: number | null;
  tableName: string | null;
  products: SelfOrderProduct[];
  categories: SelfOrderCategory[];
  currency: string;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [category, setCategory] = useState<number | "all">("all");
  const [optionProduct, setOptionProduct] = useState<SelfOrderProduct | null>(null);
  const [optionChoice, setOptionChoice] = useState("");
  const [optionNote, setOptionNote] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ number: string; total: number } | null>(null);

  const filtered = useMemo(
    () =>
      products.filter(
        (product) => category === "all" || product.categoryId === category,
      ),
    [products, category],
  );
  const total = lines.reduce(
    (sum, line) => sum + line.product.price * line.qty,
    0,
  );
  const count = lines.reduce((sum, line) => sum + line.qty, 0);

  function addLine(product: SelfOrderProduct, note = "") {
    const id = `${product.id}::${note}`;
    setLines((prev) => {
      const existing = prev.find((line) => line.id === id);
      return existing
        ? prev.map((line) => (line.id === id ? { ...line, qty: line.qty + 1 } : line))
        : [...prev, { id, product, qty: 1, note }];
    });
  }

  function choose(product: SelfOrderProduct) {
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

  async function submit() {
    if (lines.length === 0) return;
    setPending(true);
    try {
      const response = await fetch("/api/public/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storeCode,
          tableId,
          items: lines.map((line) => ({
            productId: line.product.id,
            qty: line.qty,
            note: line.note,
          })),
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        number?: string;
        total?: number;
      };
      if (!response.ok) {
        toast.error(body.error ?? "Gagal mengirim pesanan.");
        return;
      }
      setDone({ number: body.number ?? "", total: body.total ?? total });
    } catch {
      toast.error("Tidak bisa terhubung. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="grid size-12 place-items-center bg-signal text-signal-foreground">
          <Check className="size-6" />
        </span>
        <h1 className="font-serif text-3xl">Pesanan masuk</h1>
        <p className="text-sm text-muted-foreground">
          Nomor <span className="font-mono">{done.number}</span>
          {tableName ? ` · meja ${tableName}` : ""} · {formatMoney(done.total, currency)}
        </p>
        <p className="text-xs text-muted-foreground">
          Dapur sedang menyiapkan. Bayar di kasir saat selesai — terima kasih!
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setDone(null);
            setLines([]);
          }}
        >
          Pesan lagi
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-6">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid size-10 place-items-center overflow-hidden rounded-[4px]">
          {/* Logo publik toko */}
          <img src="/logo-96.jpg" alt={storeName} className="size-10 rounded-[4px] object-cover" />
        </span>
        <div>
          <h1 className="font-serif text-2xl leading-none">{storeName}</h1>
          <p className="mt-1 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            {tableName ? `Meja ${tableName} · pesan sendiri` : "Pesan sendiri"}
          </p>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={cn(
            "h-7 border px-2.5 text-[11px]",
            category === "all"
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground",
          )}
        >
          Semua
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategory(cat.id)}
            className={cn(
              "flex h-7 items-center gap-1.5 border px-2.5 text-[11px]",
              category === cat.id
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground",
            )}
          >
            <span className="size-1.5 rounded-full" style={{ background: cat.color }} />
            {cat.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {filtered.map((product) => {
          const inCart = lines
            .filter((line) => line.product.id === product.id)
            .reduce((sum, line) => sum + line.qty, 0);
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => choose(product)}
              className="flex min-h-[96px] flex-col justify-between border border-border bg-card p-3 text-left transition-all hover:border-foreground/30"
            >
              <span className="text-[13px] leading-snug font-medium">
                {product.name}
                {product.options ? (
                  <span className="block text-[10px] text-muted-foreground">pilihan</span>
                ) : null}
              </span>
              <span className="flex items-end justify-between">
                <span className="font-mono text-sm tabular">
                  {formatMoney(product.price, currency)}
                </span>
                {inCart > 0 ? (
                  <span className="grid size-5 place-items-center bg-signal font-mono text-[10px] text-signal-foreground">
                    {inCart}
                  </span>
                ) : (
                  <Plus className="size-4 text-muted-foreground" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShoppingBag className="size-3.5" />
                {count} item
                {lines.length > 0 ? (
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() => setLines([])}
                  >
                    kosongkan
                  </button>
                ) : null}
              </p>
              <p className="font-mono text-xl tabular">{formatMoney(total, currency)}</p>
            </div>
            <Button
              onClick={() => void submit()}
              disabled={pending}
              className="h-11 bg-signal px-6 text-signal-foreground hover:bg-signal/90"
            >
              {pending ? <Loader2 className="animate-spin" /> : null} Kirim pesanan
            </Button>
          </div>
        </div>
      ) : null}

      {optionProduct ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-foreground/30 p-4">
          <div className="w-full max-w-sm border border-border bg-card p-5">
            <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Pilih varian
            </p>
            <h2 className="mb-3 font-serif text-2xl">{optionProduct.name}</h2>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(optionProduct.options ?? "")
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
              className="mb-3"
            />
            <Button
              onClick={() => {
                const note = [optionChoice, optionNote.trim()].filter(Boolean).join(" · ");
                addLine(optionProduct, note);
                setOptionProduct(null);
              }}
              className="w-full bg-signal text-signal-foreground hover:bg-signal/90"
            >
              Tambahkan · {formatMoney(optionProduct.price, currency)}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setOptionProduct(null)}
              className="mt-1.5 w-full"
            >
              Batal
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
