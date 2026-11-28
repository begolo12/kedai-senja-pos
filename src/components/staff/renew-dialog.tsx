"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2 } from "lucide-react";
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
import { renewSubscriptionAction } from "@/lib/actions/staff";
import {
  computeExtendedExpiry,
  formatExpiryDate,
  type DurationUnit,
} from "@/lib/subscription";

const PRESETS: { label: string; amount: number; unit: DurationUnit }[] = [
  { label: "+1 Bulan", amount: 1, unit: "months" },
  { label: "+3 Bulan", amount: 3, unit: "months" },
  { label: "+6 Bulan", amount: 6, unit: "months" },
  { label: "+1 Tahun", amount: 1, unit: "years" },
  { label: "+2 Tahun", amount: 2, unit: "years" },
];

export function RenewDialog({
  userId,
  name,
  username,
  expiresAtIso,
  subscriptionNote,
  compact,
}: {
  userId: number;
  name: string;
  username: string;
  expiresAtIso: string | null;
  subscriptionNote: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"extend" | "unlimited" | "expire_now">("extend");
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState<DurationUnit>("months");
  const [note, setNote] = useState(subscriptionNote);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currentExpiry = expiresAtIso ? new Date(expiresAtIso) : null;
  const previewDate =
    mode === "unlimited"
      ? null
      : mode === "expire_now"
        ? new Date()
        : computeExtendedExpiry(currentExpiry, amount, unit);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await renewSubscriptionAction({
        userId,
        mode,
        amount: mode === "extend" ? amount : undefined,
        unit: mode === "extend" ? unit : undefined,
        subscriptionNote: note,
        reactivate: true,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        mode === "unlimited"
          ? `Langganan ${name} diubah menjadi tanpa batas.`
          : mode === "expire_now"
            ? `Akses ${name} dihentikan sekarang.`
            : `Langganan ${name} diperpanjang hingga ${formatExpiryDate(
                result.expiresAt ? new Date(result.expiresAt) : null,
              )}.`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
          setNote(subscriptionNote);
          setMode("extend");
          setAmount(1);
          setUnit("months");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="border-signal/40 text-signal hover:bg-signal/10"
          />
        }
      >
        <CalendarPlus className="size-3.5" />
        {compact ? "Perpanjang" : "Perpanjang"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Perpanjang Masa Aktif</DialogTitle>
          <DialogDescription>
            {name} (<span className="font-mono">@{username}</span>) · Saat ini:{" "}
            <span className="font-mono text-foreground">{formatExpiryDate(currentExpiry)}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <span className="block text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Pilihan Cepat
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESETS.map((preset) => {
                const selected =
                  mode === "extend" && amount === preset.amount && unit === preset.unit;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setMode("extend");
                      setAmount(preset.amount);
                      setUnit(preset.unit);
                    }}
                    className={`border px-2.5 py-2 text-xs transition-colors ${
                      selected
                        ? "border-signal bg-signal/15 text-signal"
                        : "border-border bg-card text-foreground hover:bg-muted"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setMode("unlimited")}
                className={`border px-2.5 py-2 text-xs transition-colors ${
                  mode === "unlimited"
                    ? "border-signal bg-signal/15 text-signal"
                    : "border-border bg-card text-foreground hover:bg-muted"
                }`}
              >
                Tanpa Batas
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={`renew-amt-${userId}`} className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Durasi Kustom
              </Label>
              <Input
                id={`renew-amt-${userId}`}
                type="number"
                min={1}
                max={120}
                value={amount}
                onChange={(e) => {
                  setMode("extend");
                  setAmount(Math.max(1, Math.min(120, Number(e.target.value) || 1)));
                }}
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`renew-unit-${userId}`} className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Satuan
              </Label>
              <select
                id={`renew-unit-${userId}`}
                value={unit}
                onChange={(e) => {
                  setMode("extend");
                  setUnit(e.target.value as DurationUnit);
                }}
                className="h-9 w-full border border-input bg-card px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="months">Bulan</option>
                <option value="years">Tahun</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor={`renew-note-${userId}`} className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Catatan / Kontak Pelanggan
            </Label>
            <Input
              id={`renew-note-${userId}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="mis. WA 0812xxx · Paket Tahunan"
            />
          </div>

          <div className="flex items-center justify-between border border-border bg-muted/20 px-3 py-2.5 text-xs">
            <span className="text-muted-foreground">Masa aktif baru</span>
            <span className="font-mono font-medium text-signal">
              {mode === "expire_now"
                ? "Kedaluwarsa sekarang"
                : mode === "unlimited"
                  ? "Tanpa batas"
                  : `s.d. ${formatExpiryDate(previewDate)}`}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMode(mode === "expire_now" ? "extend" : "expire_now")}
              className={`text-[11px] underline-offset-4 hover:underline ${
                mode === "expire_now" ? "text-destructive font-medium" : "text-muted-foreground"
              }`}
            >
              {mode === "expire_now" ? "Batal akhiri sekarang" : "Hentikan masa aktif sekarang"}
            </button>
          </div>

          {error ? (
            <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-signal text-signal-foreground hover:bg-signal/90"
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            Simpan Perpanjangan
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
