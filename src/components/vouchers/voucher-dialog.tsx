"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { saveVoucherAction } from "@/lib/actions/vouchers";
import { formatNumber, parseMoneyInput } from "@/lib/money";

export type VoucherFormValues = {
  id?: number;
  code: string;
  label: string;
  type: "percent" | "fixed";
  value: number;
  minSubtotal: number;
  startsAt: string;
  endsAt: string;
  usageLimit: number;
  active: boolean;
};

const BLANK: VoucherFormValues = {
  code: "",
  label: "",
  type: "percent",
  value: 0,
  minSubtotal: 0,
  startsAt: "",
  endsAt: "",
  usageLimit: 0,
  active: true,
};

export function VoucherDialog({ voucher }: { voucher?: VoucherFormValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<VoucherFormValues>(voucher ?? BLANK);
  const [value, setValue] = useState(
    voucher ? String(voucher.type === "percent" ? voucher.value : Math.round(voucher.value / 100)) : "",
  );
  const [minSubtotal, setMinSubtotal] = useState(
    voucher ? String(Math.round(voucher.minSubtotal / 100)) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(voucher?.id);

  function field<K extends keyof VoucherFormValues>(key: K, val: VoucherFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveVoucherAction({
        id: voucher?.id,
        code: values.code,
        label: values.label,
        type: values.type,
        value:
          values.type === "percent"
            ? Math.min(100, Math.max(0, Number(value.replace(/[^\d]/g, "") || 0)))
            : parseMoneyInput(value),
        minSubtotal: parseMoneyInput(minSubtotal),
        startsAt: values.startsAt,
        endsAt: values.endsAt,
        usageLimit: values.usageLimit,
        active: values.active,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Voucher diperbarui." : "Voucher ditambahkan.");
      setOpen(false);
      if (!editing) {
        setValues(BLANK);
        setValue("");
        setMinSubtotal("");
      }
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
          editing ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${voucher?.code}`} />
          ) : (
            <Button size="sm" className="bg-signal text-signal-foreground hover:bg-signal/90" />
          )
        }
      >
        {editing ? <Pencil className="size-3.5" /> : (<><Plus /> Voucher baru</>)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {editing ? "Edit voucher" : "Voucher baru"}
          </DialogTitle>
          <DialogDescription>
            Kode dihitung ulang di server saat checkout: periode, batas belanja, dan kuota
            divalidasi ulang setiap transaksi.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="v-code" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Kode
              </Label>
              <Input
                id="v-code"
                value={values.code}
                onChange={(e) => field("code", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
                required
                className="font-mono"
                maxLength={32}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-label" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Nama promo (opsional)
              </Label>
              <Input id="v-label" value={values.label} onChange={(e) => field("label", e.target.value)} maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Jenis</Label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => field("type", "percent")}
                  className={`h-8 border px-3 font-mono text-[11px] ${
                    values.type === "percent"
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => field("type", "fixed")}
                  className={`h-8 border px-3 font-mono text-[11px] ${
                    values.type === "fixed"
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  Rp
                </button>
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  aria-label="Nilai voucher"
                  className="ml-1 h-8 w-24 rounded-none border-border font-mono"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {values.type === "percent" ? "Persen dari subtotal." : "Potongan rupiah tetap."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-min" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Belanja minimal (Rp)
              </Label>
              <Input
                id="v-min"
                value={formatNumber(parseMoneyInput(minSubtotal) / 100)}
                onChange={(e) => setMinSubtotal(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">0 = tanpa syarat.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-start" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Berlaku mulai
              </Label>
              <Input
                id="v-start"
                type="date"
                value={values.startsAt}
                max={values.endsAt || undefined}
                onChange={(e) => field("startsAt", e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-end" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Berlaku sampai
              </Label>
              <Input
                id="v-end"
                type="date"
                value={values.endsAt}
                min={values.startsAt || undefined}
                onChange={(e) => field("endsAt", e.target.value)}
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">Kosong = tanpa batas waktu.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-limit" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Batas pemakaian
              </Label>
              <Input
                id="v-limit"
                value={values.usageLimit === 0 ? "" : values.usageLimit}
                onChange={(e) => {
                  const next = Number(e.target.value.replace(/[^\d]/g, "") || 0);
                  field("usageLimit", Math.min(1_000_000, next));
                }}
                inputMode="numeric"
                placeholder="0"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">0 = tanpa batas. Refund membebaskan kuota kembali.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-active" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Status
              </Label>
              <label className="flex h-8 items-center gap-2 text-sm">
                <Checkbox
                  id="v-active"
                  checked={values.active}
                  onCheckedChange={(checked) => field("active", checked === true)}
                />
                Aktif
              </label>
            </div>
          </div>

          {error ? (
            <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}{" "}
            {editing ? "Simpan voucher" : "Tambah voucher"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
