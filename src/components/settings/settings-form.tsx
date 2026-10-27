"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateSettingsAction } from "@/lib/actions/settings";
import { formatNumber, parseMoneyInput } from "@/lib/money";

export type SettingsValues = {
  storeName: string;
  address: string;
  phone: string;
  currency: string;
  taxRate: number;
  receiptFooter: string;
  receiptWidth: "58" | "80";
  qrisPayload: string;
  pointsPerAmount: number;
};

export function SettingsForm({ settings }: { settings: SettingsValues }) {
  const router = useRouter();
  const [values, setValues] = useState(settings);
  const [tax, setTax] = useState(String(settings.taxRate / 100));
  const [points, setPoints] = useState(String(Math.round(settings.pointsPerAmount / 100)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateSettingsAction({
        storeName: values.storeName,
        address: values.address,
        phone: values.phone,
        currency: "IDR",
        taxRate: Math.round(Number(tax.replace(",", ".")) * 100) || 0,
        receiptFooter: values.receiptFooter,
        receiptWidth: values.receiptWidth,
        qrisPayload: values.qrisPayload,
        pointsPerAmount: parseMoneyInput(points),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Pengaturan disimpan.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="store" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Nama toko
          </Label>
          <Input id="store" value={values.storeName} onChange={(e) => set("storeName", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Telepon
          </Label>
          <Input id="phone" value={values.phone} onChange={(e) => set("phone", e.target.value)} className="font-mono" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Alamat (tercetak di struk)
          </Label>
          <Textarea id="address" rows={2} value={values.address} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tax" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Pajak (%)
          </Label>
          <Input
            id="tax"
            value={tax}
            onChange={(e) => setTax(e.target.value.replace(/[^\d.,]/g, ""))}
            inputMode="decimal"
            className="font-mono"
          />
          <p className="text-[11px] text-muted-foreground">0 untuk menonaktifkan pajak.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="points" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Belanja per 1 poin (Rp)
          </Label>
          <Input
            id="points"
            value={formatNumber(parseMoneyInput(points) / 100)}
            onChange={(e) => setPoints(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            className="font-mono"
          />
          <p className="text-[11px] text-muted-foreground">Contoh: 10.000 berarti tiap Rp 10.000 dapat 1 poin.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="width" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Lebar kertas
          </Label>
          <select
            id="width"
            value={values.receiptWidth}
            onChange={(e) => set("receiptWidth", e.target.value as "58" | "80")}
            className="h-8 w-full border border-input bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="58">58 mm (struk kecil)</option>
            <option value="80">80 mm (standar)</option>
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="qris" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            QRIS merchant
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="qris"
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 300_000) {
                  setError("Gambar QRIS maksimal 300 KB.");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => set("qrisPayload", String(reader.result ?? ""));
                reader.readAsDataURL(file);
              }}
              className="max-w-xs"
            />
            {values.qrisPayload ? (
              <Button type="button" variant="outline" size="sm" onClick={() => set("qrisPayload", "")}>
                Hapus QRIS
              </Button>
            ) : null}
          </div>
          {values.qrisPayload.startsWith("data:image") ? (
            <img
              src={values.qrisPayload}
              alt="Contoh QRIS merchant"
              className="mt-2 size-36 border border-border bg-white object-contain p-1"
            />
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            Unggah gambar QRIS dari bank/e-wallet. Muncul otomatis di layar pembayaran QRIS.
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="footer" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Catatan kaki struk
          </Label>
          <Input id="footer" value={values.receiptFooter} onChange={(e) => set("receiptFooter", e.target.value)} maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency" className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Mata uang
          </Label>
          <Input id="currency" value="IDR — Rupiah" disabled />
          <p className="text-[11px] text-muted-foreground">Format angka mengikuti locale Indonesia.</p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Simpan pengaturan
      </Button>
    </form>
  );
}