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
import { Textarea } from "@/components/ui/textarea";
import { saveTierAction } from "@/lib/actions/tiers";
import { formatNumber, parseMoneyInput } from "@/lib/money";

export type TierFormValues = {
  id?: number;
  name: string;
  minTotalSpent: number;
  pointsMultiplier: number;
  perks: string;
  active: boolean;
};

export function TierDialog({ tier }: { tier?: TierFormValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<TierFormValues>(
    tier ?? { name: "", minTotalSpent: 0, pointsMultiplier: 100, perks: "", active: true },
  );
  const [minSpent, setMinSpent] = useState(
    tier ? String(Math.round(tier.minTotalSpent / 100)) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(tier?.id);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveTierAction({
        id: tier?.id,
        name: values.name,
        minTotalSpent: parseMoneyInput(minSpent),
        pointsMultiplier: values.pointsMultiplier,
        perks: values.perks,
        active: values.active,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Tier diperbarui." : "Tier ditambahkan.");
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
          editing ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${tier?.name}`} />
          ) : (
            <Button size="sm" className="bg-signal text-signal-foreground hover:bg-signal/90" />
          )
        }
      >
        {editing ? <Pencil className="size-3.5" /> : (<><Plus /> Tier baru</>)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {editing ? "Edit tier" : "Tier baru"}
          </DialogTitle>
          <DialogDescription>
            Tier menentukan kelipatan poin: total belanja pelanggan melampaui
            ambang → poin dikali kelipatan (100 = normal).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-name" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Nama
            </Label>
            <Input
              id="t-name"
              value={values.name}
              onChange={(e) => setValues((prev) => ({ ...prev, name: e.target.value }))}
              required
              maxLength={40}
              placeholder="mis. Gold"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-min" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Ambang total belanja (Rp)
            </Label>
            <Input
              id="t-min"
              value={minSpent ? formatNumber(parseMoneyInput(minSpent) / 100) : ""}
              onChange={(e) => setMinSpent(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              0 = tier awal semua pelanggan.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-mult" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Kelipatan poin
            </Label>
            <Input
              id="t-mult"
              value={values.pointsMultiplier}
              onChange={(e) => {
                const next = Math.min(
                  1000,
                  Math.max(50, Number(e.target.value.replace(/\D/g, "") || 100)),
                );
                setValues((prev) => ({ ...prev, pointsMultiplier: next }));
              }}
              inputMode="numeric"
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              100 = normal · 150 = 1,5× poin · 200 = 2× poin.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-perks" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Benefit (opsional)
            </Label>
            <Textarea
              id="t-perks"
              value={values.perks}
              onChange={(e) => setValues((prev) => ({ ...prev, perks: e.target.value }))}
              rows={2}
              maxLength={200}
              placeholder="mis. gratis kopi setiap 10 kunjungan"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={values.active}
              onCheckedChange={(checked) =>
                setValues((prev) => ({ ...prev, active: checked === true }))
              }
            />
            Aktif
          </label>

          {error ? (
            <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}{" "}
            {editing ? "Simpan tier" : "Tambah tier"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
