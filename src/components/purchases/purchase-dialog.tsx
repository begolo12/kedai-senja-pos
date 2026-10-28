"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackagePlus, Plus, X } from "lucide-react";
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
import { createPurchaseOrderAction } from "@/lib/actions/purchases";
import { formatMoney, formatNumber, parseMoneyInput } from "@/lib/money";

export type PoProduct = { id: number; name: string; unit: string; cost: number; stock: number };
export type PoSupplier = { id: number; name: string };

type Row = { productId: number | ""; qtyInput: string; costInput: string };

const BLANK_ROW: Row = { productId: "", qtyInput: "", costInput: "" };

export function PurchaseDialog({
  products,
  suppliers,
  currency,
}: {
  products: PoProduct[];
  suppliers: PoSupplier[];
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [expectedAt, setExpectedAt] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([{ ...BLANK_ROW }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const total = rows.reduce((sum, row) => {
    if (row.productId === "") return sum;
    return sum + parseMoneyInput(row.costInput) * Number(row.qtyInput.replace(/\D/g, "") || 0);
  }, 0);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const items = rows
      .filter((row) => row.productId !== "" && Number(row.qtyInput.replace(/\D/g, "") || 0) > 0)
      .map((row) => ({
        productId: row.productId as number,
        qty: Number(row.qtyInput.replace(/\D/g, "") || 0),
        unitCost: parseMoneyInput(row.costInput),
      }));
    if (items.length === 0) {
      setError("Tambahkan minimal satu produk dengan jumlah.");
      return;
    }
    startTransition(async () => {
      const result = await createPurchaseOrderAction({
        supplierId: supplierId ? Number(supplierId) : null,
        note,
        expectedAt,
        items,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("PO dibuat. Stok masuk saat diterima.");
      setOpen(false);
      setRows([{ ...BLANK_ROW }]);
      setSupplierId("");
      setExpectedAt("");
      setNote("");
      router.refresh();
    });
  }

  function setRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
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
        render={<Button size="sm" className="bg-signal text-signal-foreground hover:bg-signal/90" />}
      >
        <PackagePlus /> PO baru
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Purchase order baru</DialogTitle>
          <DialogDescription>
            Catat pesanan pembelian ke supplier. Stok bertambah saat PO ditandai diterima.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="po-supplier" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Supplier
              </Label>
              <select
                id="po-supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="h-9 w-full border border-input bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="">Tanpa supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-expected" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Estimasi tiba
              </Label>
              <Input
                id="po-expected"
                type="date"
                value={expectedAt}
                onChange={(e) => setExpectedAt(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Item
            </Label>
            {rows.map((row, index) => {
              const product = row.productId === "" ? null : byId.get(row.productId as number);
              return (
                <div key={index} className="flex flex-wrap items-center gap-1.5 border border-border px-2 py-1.5">
                  <select
                    value={row.productId}
                    onChange={(e) => {
                      const id = e.target.value === "" ? "" : Number(e.target.value);
                      const found = id === "" ? null : byId.get(id);
                      setRow(index, {
                        productId: id,
                        costInput: found
                          ? String(Math.round(found.cost / 100))
                          : row.costInput,
                      });
                    }}
                    aria-label="Produk"
                    className="h-8 min-w-40 flex-1 border border-input bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    <option value="">Pilih produk…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={row.qtyInput}
                    onChange={(e) => setRow(index, { qtyInput: e.target.value.replace(/\D/g, "") })}
                    inputMode="numeric"
                    placeholder="Qty"
                    aria-label="Jumlah"
                    className="h-8 w-20 rounded-none border-border text-right font-mono text-sm"
                  />
                  <Input
                    value={row.costInput ? formatNumber(parseMoneyInput(row.costInput) / 100) : ""}
                    onChange={(e) => setRow(index, { costInput: e.target.value.replace(/[^\d]/g, "") })}
                    inputMode="numeric"
                    placeholder="Harga beli"
                    aria-label="Harga beli per unit"
                    className="h-8 w-24 rounded-none border-border text-right font-mono text-sm"
                  />
                  {product ? (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      stok {product.stock}
                    </span>
                  ) : null}
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      aria-label="Hapus baris"
                      onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows((prev) => [...prev, { ...BLANK_ROW }])}
            >
              <Plus /> Tambah item
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="po-note" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Catatan (opsional)
            </Label>
            <Input
              id="po-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="flex items-center justify-between border-t border-dashed pt-2 text-xs">
            <span className="text-muted-foreground">Total biaya</span>
            <span className="font-mono tabular">{formatMoney(total, currency)}</span>
          </div>

          {error ? (
            <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null} Buat PO
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
