"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownUp, Loader2 } from "lucide-react";
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
import { adjustStockAction } from "@/lib/actions/inventory";

export function StockAdjustDialog({
  productId,
  name,
  stock,
  unit,
}: {
  productId: number;
  name: string;
  stock: number;
  unit: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState<"restock" | "correction" | "waste">("restock");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const amount = Number(qty.replace(/\D/g, "")) || 0;
    startTransition(async () => {
      const result = await adjustStockAction({
        productId,
        delta: direction === "in" ? amount : -amount,
        reason,
        note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Stok ${name} disesuaikan.`);
      setOpen(false);
      setQty("1");
      setNote("");
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
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <ArrowDownUp /> Sesuaikan
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Sesuaikan stok</DialogTitle>
          <DialogDescription>
            {name} · stok sekarang {stock} {unit}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setDirection("in")}
              className={`border px-3 py-2 text-sm ${direction === "in" ? "border-foreground bg-foreground text-background" : "border-border"}`}
            >
              Tambah
            </button>
            <button
              type="button"
              onClick={() => setDirection("out")}
              className={`border px-3 py-2 text-sm ${direction === "out" ? "border-foreground bg-foreground text-background" : "border-border"}`}
            >
              Kurangi
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="qty" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Jumlah ({unit})
              </Label>
              <Input
                id="qty"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reason" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Alasan
              </Label>
              <select
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value as typeof reason)}
                className="h-8 w-full border border-input bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="restock">Restock</option>
                <option value="correction">Koreksi hitung</option>
                <option value="waste">Rusak / terbuang</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="note" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Catatan
            </Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="opsional" />
          </div>

          <p className="text-xs text-muted-foreground">
            Stok setelah: {direction === "in" ? stock + (Number(qty) || 0) : stock - (Number(qty) || 0)} {unit}
          </p>

          {error ? (
            <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="animate-spin" /> : null} Simpan penyesuaian
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}