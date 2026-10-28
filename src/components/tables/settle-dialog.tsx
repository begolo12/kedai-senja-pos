"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Loader2, Receipt } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { settleOrderAction } from "@/lib/actions/tables";
import { formatMoney, formatNumber, parseMoneyInput } from "@/lib/money";

export type SettleBill = {
  orderId: number;
  number: string;
  tableLabel: string | null;
  total: number;
};

type Method = "cash" | "qris" | "card";

const METHODS: { value: Method; label: string }[] = [
  { value: "cash", label: "Tunai" },
  { value: "qris", label: "QRIS" },
  { value: "card", label: "Kartu" },
];

export function SettleDialog({
  bill,
  currency,
  customers,
}: {
  bill: SettleBill;
  currency: string;
  customers: { id: number; name: string; points: number }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method>("cash");
  const [cash, setCash] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const paid = method === "cash" ? parseMoneyInput(cash) : bill.total;
  const change = paid - bill.total;

  function confirm() {
    setError(null);
    if (method === "cash" && paid < bill.total) {
      setError("Uang diterima kurang dari tagihan.");
      return;
    }
    startTransition(async () => {
      const result = await settleOrderAction(
        bill.orderId,
        [{ method, amount: method === "cash" ? paid : bill.total }],
        customerId ? Number(customerId) : null,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        `Tagihan ${bill.number} diselesaikan · kembalian ${formatMoney(Math.max(0, result.changeDue), currency)}.`,
      );
      setOpen(false);
      router.refresh();
      router.push(`/receipt/${bill.orderId}?fresh=1`);
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
      <DialogTrigger render={<Button size="sm" className="bg-signal text-signal-foreground hover:bg-signal/90" />}>
        <Banknote /> Bayar
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Bayar {bill.number}</DialogTitle>
          <DialogDescription>
            {bill.tableLabel ? `Meja ${bill.tableLabel} · ` : ""}tagihan meja, belum
            dibayar.
          </DialogDescription>
        </DialogHeader>

        <div className="border border-border bg-muted/40 px-3 py-2">
          <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Total tagihan
          </p>
          <p className="font-mono text-3xl tracking-tight tabular">
            {formatMoney(bill.total, currency)}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {METHODS.map((entry) => (
            <Button
              key={entry.value}
              type="button"
              size="sm"
              variant={method === entry.value ? "default" : "outline"}
              onClick={() => setMethod(entry.value)}
            >
              {entry.label}
            </Button>
          ))}
        </div>

        {method === "cash" ? (
          <div className="space-y-1.5">
            <label
              htmlFor="settle-cash"
              className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase"
            >
              Uang diterima
            </label>
            <Input
              id="settle-cash"
              value={cash ? formatNumber(parseMoneyInput(cash) / 100) : ""}
              onChange={(event) => setCash(event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              autoFocus
              className="input-cash h-12 rounded-none border-foreground/30 text-right font-mono text-2xl"
            />
            <div className="flex items-center justify-between border-t border-dashed pt-2 text-xs">
              <span className="text-muted-foreground">Kembalian</span>
              <span
                className={cn(
                  "font-mono text-lg tabular",
                  change < 0 ? "text-destructive" : "text-foreground",
                )}
              >
                {formatMoney(Math.max(0, change), currency)}
              </span>
            </div>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label
            htmlFor="settle-customer"
            className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase"
          >
            Pelanggan (opsional, untuk poin)
          </label>
          <select
            id="settle-customer"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            className="h-9 w-full border border-input bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="">Pelanggan umum</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} · {customer.points} poin
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <Button
          onClick={confirm}
          disabled={pending || (method === "cash" && change < 0)}
          className="h-11 w-full bg-signal text-signal-foreground hover:bg-signal/90"
        >
          {pending ? <Loader2 className="animate-spin" /> : <Receipt />} Terima pembayaran
        </Button>
      </DialogContent>
    </Dialog>
  );
}
