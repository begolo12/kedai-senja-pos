"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
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
import { saveStoreAction } from "@/lib/actions/stores";

export type StoreValues = {
  id?: number;
  name: string;
  code: string;
  address: string;
  phone: string;
  taxRate: number;
  receiptWidth: "58" | "80";
  active: boolean;
};

export function StoreDialog({
  store,
  current,
}: {
  store?: StoreValues;
  current?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<StoreValues>(
    store ?? {
      name: "",
      code: "",
      address: "",
      phone: "",
      taxRate: 1100,
      receiptWidth: "80",
      active: true,
    },
  );
  const [tax, setTax] = useState(String((store?.taxRate ?? 1100) / 100));
  const [copyMenu, setCopyMenu] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(store?.id);

  function set<K extends keyof StoreValues>(key: K, value: StoreValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveStoreAction({
        id: store?.id,
        name: values.name,
        code: values.code,
        address: values.address,
        phone: values.phone,
        taxRate: Math.round(Number(tax.replace(",", ".")) * 100) || 0,
        receiptWidth: values.receiptWidth,
        active: values.active,
        copyMenu,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Toko diperbarui." : "Toko ditambahkan.");
      setOpen(false);
      if (!editing) {
        setValues({
          name: "",
          code: "",
          address: "",
          phone: "",
          taxRate: 1100,
          receiptWidth: "80",
          active: true,
        });
        setTax("11");
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
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${store?.name}`} />
          ) : (
            <Button size="sm" className="bg-signal text-signal-foreground hover:bg-signal/90" />
          )
        }
      >
        {editing ? <Pencil className="size-3.5" /> : <><Plus /> Toko baru</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {editing ? "Edit toko" : "Toko baru"}
          </DialogTitle>
          <DialogDescription>
            Setiap toko punya menu, stok, pesanan, kasir, dan QRIS sendiri.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama toko" htmlFor="st-name">
              <Input
                id="st-name"
                value={values.name}
                onChange={(event) => set("name", event.target.value)}
                required
              />
            </Field>
            <Field label="Kode unik" htmlFor="st-code">
              <Input
                id="st-code"
                value={values.code}
                onChange={(event) =>
                  set("code", event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                placeholder="kemang"
                className="font-mono"
                required
              />
            </Field>
            <Field label="Alamat" htmlFor="st-address">
              <Input
                id="st-address"
                value={values.address}
                onChange={(event) => set("address", event.target.value)}
              />
            </Field>
            <Field label="Telepon" htmlFor="st-phone">
              <Input
                id="st-phone"
                value={values.phone}
                onChange={(event) => set("phone", event.target.value)}
                className="font-mono"
              />
            </Field>
            <Field label="Pajak (%)" htmlFor="st-tax">
              <Input
                id="st-tax"
                value={tax}
                onChange={(event) => setTax(event.target.value.replace(/[^\d.,]/g, ""))}
                inputMode="decimal"
                className="font-mono"
              />
            </Field>
            <Field label="Lebar struk" htmlFor="st-width">
              <select
                id="st-width"
                value={values.receiptWidth}
                onChange={(event) => set("receiptWidth", event.target.value as "58" | "80")}
                className="h-8 w-full border border-input bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="58">58 mm</option>
                <option value="80">80 mm</option>
              </select>
            </Field>
          </div>

          {!editing ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={copyMenu}
                onChange={(event) => setCopyMenu(event.target.checked)}
                className="size-3.5 accent-foreground"
              />
              Salin menu, kategori, dan stok dari toko aktif
            </label>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.active}
              disabled={current}
              onChange={(event) => set("active", event.target.checked)}
              className="size-3.5 accent-foreground"
            />
            Toko aktif {current ? "(toko yang sedang dipakai)" : ""}
          </label>

          {error ? (
            <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="animate-spin" /> : null}
            {editing ? "Simpan perubahan" : "Tambah toko"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </Label>
      {children}
    </div>
  );
}
