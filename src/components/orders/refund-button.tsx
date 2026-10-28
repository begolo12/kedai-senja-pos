"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, RotateCcw } from "lucide-react";
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
import { refundOrderItemsAction } from "@/lib/actions/sales";
import { formatMoney } from "@/lib/money";

export type RefundItem = {
  id: number;
  name: string;
  qty: number;
  refundedQty: number;
  unitPrice: number;
};

export function RefundButton({
  orderId,
  number,
  items,
  currency,
}: {
  orderId: number;
  number: string;
  items: RefundItem[];
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [pending, startTransition] = useTransition();

  const remaining = useMemo(
    () =>
      new Map(
        items.map((item) => [item.id, Math.max(0, item.qty - item.refundedQty)]),
      ),
    [items],
  );
  const selectedRows = Object.entries(selected)
    .map(([id, qty]) => ({ itemId: Number(id), qty }))
    .filter((row) => row.qty > 0);
  const selectedValue = selectedRows.reduce((sum, row) => {
    const item = items.find((entry) => entry.id === row.itemId);
    return sum + (item ? item.unitPrice * row.qty : 0);
  }, 0);
  const allSelected = items.every(
    (item) => (selected[item.id] ?? 0) >= (remaining.get(item.id) ?? 0) && (remaining.get(item.id) ?? 0) > 0,
  );

  function setQty(itemId: number, qty: number) {
    const max = remaining.get(itemId) ?? 0;
    setSelected((prev) => ({ ...prev, [itemId]: Math.min(Math.max(0, qty), max) }));
  }

  function selectAll() {
    setSelected((prev) => {
      const next = { ...prev };
      for (const [id, qty] of remaining) next[id] = qty;
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" className="text-destructive hover:text-destructive" />}
      >
        <RotateCcw /> Refund
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Refund {number}</DialogTitle>
          <DialogDescription>
            Pilih item dan jumlahnya. Stok dikembalikan, poin dan total belanja pelanggan
            dikoreksi proporsional. Tidak bisa dibatalkan.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {items
            .filter((item) => (remaining.get(item.id) ?? 0) > 0)
            .map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    sisa {remaining.get(item.id)} × {formatMoney(item.unitPrice, currency)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Kurangi ${item.name}`}
                    onClick={() => setQty(item.id, (selected[item.id] ?? 0) - 1)}
                    className="grid size-6 place-items-center border border-border hover:bg-muted"
                  >
                    <Minus className="size-3" />
                  </button>
                  <Input
                    value={selected[item.id] ?? 0}
                    onChange={(event) => {
                      const next = Number(event.target.value.replace(/\D/g, "") || 0);
                      setQty(item.id, next);
                    }}
                    inputMode="numeric"
                    aria-label={`Jumlah refund ${item.name}`}
                    className="h-7 w-12 rounded-none border-border text-center font-mono text-xs"
                  />
                  <button
                    type="button"
                    aria-label={`Tambah ${item.name}`}
                    onClick={() => setQty(item.id, (selected[item.id] ?? 0) + 1)}
                    className="grid size-6 place-items-center border border-border hover:bg-muted"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
              </div>
            ))}
        </div>

        <button
          type="button"
          onClick={selectAll}
          className="self-start text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Pilih semua item tersisa (refund penuh)
        </button>

        <div className="space-y-1.5">
          <Label
            htmlFor="refund-reason"
            className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase"
          >
            Alasan
          </Label>
          <Textarea
            id="refund-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="mis. pesanan salah input"
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between border-t border-dashed pt-2 text-xs">
          <span className="text-muted-foreground">
            {allSelected ? "Seluruh pesanan" : "Nilai kotor pilihan"}
          </span>
          <span className="font-mono tabular">{formatMoney(selectedValue, currency)}</span>
        </div>

        <Button
          variant="destructive"
          disabled={
            pending || reason.trim().length < 3 || selectedRows.length === 0
          }
          onClick={() =>
            startTransition(async () => {
              const result = await refundOrderItemsAction(orderId, selectedRows, reason.trim());
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(
                allSelected ? "Pesanan direfund penuh." : "Item dipilih direfund.",
              );
              setOpen(false);
              setSelected({});
              setReason("");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : null} Refund
        </Button>
      </DialogContent>
    </Dialog>
  );
}
