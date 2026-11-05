"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { closeShiftAction, createExpenseAction, openShiftAction } from "@/lib/actions/shifts";
import { formatMoney, formatNumber, parseMoneyInput } from "@/lib/money";

export function OpenShiftForm({ currency }: { currency: string }) {
  const router = useRouter();
  const [value, setValue] = useState("200000");
  const [pending, startTransition] = useTransition();
  const minor = parseMoneyInput(value);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await openShiftAction({ openingFloat: minor });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Shift dibuka. Kasir siap.");
          router.refresh();
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="float" className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Kas awal di laci
        </Label>
        <Input
          id="float"
          value={formatNumber(minor / 100)}
          onChange={(event) => setValue(event.target.value.replace(/[^\d]/g, ""))}
          inputMode="numeric"
          className="h-11 rounded-none font-mono text-lg"
        />
        <p className="text-xs text-muted-foreground">
          Isi uang tunai yang sudah ada di laci sebelum transaksi pertama.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {[100000, 200000, 300000, 500000].map((amount) => (
          <Button
            key={amount}
            type="button"
            variant="outline"
            size="sm"
            className="font-mono text-[11px]"
            onClick={() => setValue(String(amount))}
          >
            {formatMoney(amount * 100, currency)}
          </Button>
        ))}
      </div>
      <Button type="submit" disabled={pending} className="w-full bg-signal text-signal-foreground hover:bg-signal/90">
        {pending ? <Loader2 className="animate-spin" /> : null} Buka shift
      </Button>
    </form>
  );
}

export function CloseShiftForm({
  expectedCash,
  currency,
  shiftId,
}: {
  expectedCash: number;
  currency: string;
  shiftId: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(expectedCash / 100));
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const counted = parseMoneyInput(value);
  const difference = counted - expectedCash;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await closeShiftAction({ checkedCash: counted, note });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`Shift ${shiftId} ditutup.`);
          router.refresh();
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="counted" className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Uang laci dihitung
        </Label>
        <Input
          id="counted"
          value={formatNumber(counted / 100)}
          onChange={(event) => setValue(event.target.value.replace(/[^\d]/g, ""))}
          inputMode="numeric"
          className="h-11 rounded-none font-mono text-lg"
        />
        <div className="flex justify-between pt-1 text-xs">
          <span className="text-muted-foreground">Seharusnya</span>
          <span className="font-mono">{formatMoney(expectedCash, currency)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Selisih</span>
          <span
            className={
              difference === 0
                ? "font-mono text-muted-foreground"
                : difference > 0
                  ? "font-mono text-signal"
                  : "font-mono text-destructive"
            }
          >
            {difference > 0 ? "+" : ""}
            {formatMoney(difference, currency)}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note" className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Catatan (opsional)
        </Label>
        <Textarea
          id="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="mis. selisih karena kembalian kecil"
          rows={2}
        />
      </div>

      <Button type="submit" variant="outline" disabled={pending} className="w-full">
        {pending ? <Loader2 className="animate-spin" /> : null} Tutup shift
      </Button>
    </form>
  );
}
export function ExpenseForm({ currency }: { currency: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const amount = parseMoneyInput(value);
  const valid = amount > 0 && note.trim().length >= 2;

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        startTransition(async () => {
          const result = await createExpenseAction({ amount, note: note.trim() });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Pengeluaran tercatat.");
          setValue("");
          setNote("");
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="expense-amount" className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Nominal
          </Label>
          <Input
            id="expense-amount"
            value={formatNumber(amount / 100)}
            onChange={(event) => setValue(event.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="0"
            className="h-10 rounded-none font-mono"
          />
          {amount > 0 ? (
            <p className="font-mono text-xs text-muted-foreground">{formatMoney(amount, currency)}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expense-note" className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Keterangan
          </Label>
          <Input
            id="expense-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={120}
            placeholder="mis. beli gas 3 kg"
            className="h-10 rounded-none"
          />
        </div>
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={pending || !valid}>
        {pending ? <Loader2 className="animate-spin" /> : null} Catat pengeluaran
      </Button>
    </form>
  );
}
