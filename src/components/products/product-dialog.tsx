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
import { saveProductAction } from "@/lib/actions/catalog";
import { formatNumber, parseMoneyInput } from "@/lib/money";

export type ProductFormValues = {
  id?: number;
  name: string;
  sku: string;
  barcode: string | null;
  categoryId: number | null;
  price: number;
  cost: number;
  stock: number;
  lowStockAt: number;
  unit: string;
  options: string;
  active: boolean;
  recipe?: { productId: number; qty: number }[];
};

const BLANK: ProductFormValues = {
  name: "",
  sku: "",
  barcode: "",
  categoryId: null,
  price: 0,
  cost: 0,
  stock: 0,
  lowStockAt: 5,
  unit: "pcs",
  options: "",
  active: true,
  recipe: [],
};

export function ProductDialog({
  product,
  categories,
  products,
}: {
  product?: ProductFormValues;
  categories: { id: number; name: string }[];
  products: { id: number; name: string; unit: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ProductFormValues>(product ?? BLANK);
  const [recipeRows, setRecipeRows] = useState<{ productId: string; qtyInput: string }[]>(
    (product?.recipe ?? []).map((row) => ({
      productId: String(row.productId),
      qtyInput: String(row.qty),
    })),
  );
  const [price, setPrice] = useState(String(Math.round((product?.price ?? 0) / 100)));
  const [cost, setCost] = useState(String(Math.round((product?.cost ?? 0) / 100)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(product?.id);

  function field<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const recipe = recipeRows
      .filter((row) => row.productId !== "" && Number(row.qtyInput.replace(/\D/g, "") || 0) > 0)
      .map((row) => ({
        productId: Number(row.productId),
        qty: Number(row.qtyInput.replace(/\D/g, "") || 0),
      }));
    startTransition(async () => {
      const result = await saveProductAction({
        id: product?.id,
        name: values.name,
        sku: values.sku,
        barcode: values.barcode ?? "",
        categoryId: values.categoryId,
        price: parseMoneyInput(price),
        cost: parseMoneyInput(cost),
        stock: values.stock,
        lowStockAt: values.lowStockAt,
        unit: values.unit,
        options: values.options,
        recipe,
        active: values.active,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Produk diperbarui." : "Produk ditambahkan.");
      setOpen(false);
      if (!editing) {
        setValues(BLANK);
        setPrice("0");
        setCost("0");
        setRecipeRows([]);
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
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${product?.name}`} />
          ) : (
            <Button size="sm" className="bg-signal text-signal-foreground hover:bg-signal/90" />
          )
        }
      >
        {editing ? <Pencil className="size-3.5" /> : <><Plus /> Produk baru</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {editing ? "Edit produk" : "Produk baru"}
          </DialogTitle>
          <DialogDescription>
            Harga dan modal disimpan sebagai angka bulat rupiah. Stok awal ikut tercatat.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama" htmlFor="p-name">
              <Input id="p-name" value={values.name} onChange={(e) => field("name", e.target.value)} required />
            </Field>
            <Field label="Kategori" htmlFor="p-cat">
              <select
                id="p-cat"
                value={values.categoryId ?? ""}
                onChange={(e) => field("categoryId", e.target.value ? Number(e.target.value) : null)}
                className="h-8 w-full border border-input bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="">Tanpa kategori</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="SKU" htmlFor="p-sku">
              <Input id="p-sku" value={values.sku} onChange={(e) => field("sku", e.target.value.toUpperCase())} required className="font-mono" />
            </Field>
            <Field label="Barcode" htmlFor="p-barcode">
              <Input id="p-barcode" value={values.barcode ?? ""} onChange={(e) => field("barcode", e.target.value)} className="font-mono" />
            </Field>
            <Field label="Harga jual (Rp)" htmlFor="p-price">
              <Input
                id="p-price"
                value={formatNumber(parseMoneyInput(price) / 100)}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className="font-mono"
              />
            </Field>
            <Field label="Modal (Rp)" htmlFor="p-cost">
              <Input
                id="p-cost"
                value={formatNumber(parseMoneyInput(cost) / 100)}
                onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className="font-mono"
              />
            </Field>
            <Field label="Stok" htmlFor="p-stock">
              <Input
                id="p-stock"
                type="number"
                min={0}
                value={values.stock}
                onChange={(e) => field("stock", Number(e.target.value))}
                className="font-mono"
              />
            </Field>
            <Field label="Batas stok rendah" htmlFor="p-low">
              <Input
                id="p-low"
                type="number"
                min={0}
                value={values.lowStockAt}
                onChange={(e) => field("lowStockAt", Number(e.target.value))}
                className="font-mono"
              />
            </Field>
            <Field label="Satuan" htmlFor="p-unit">
              <Input id="p-unit" value={values.unit} onChange={(e) => field("unit", e.target.value)} />
            </Field>
            <Field label="Pilihan (pisahkan koma)" htmlFor="p-options">
              <Input
                id="p-options"
                value={values.options}
                onChange={(e) => field("options", e.target.value)}
                placeholder="mis. Level 1,Level 2,Level 3"
              />
            </Field>
            <label className="flex items-center gap-2 pt-5 text-sm">
              <Checkbox checked={values.active} onCheckedChange={(checked) => field("active", Boolean(checked))} />
              Dijual di kasir
            </label>
          </div>

          <div className="space-y-1.5 border-t border-dashed pt-3">
            <Label className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Resep / bahan (opsional)
            </Label>
            {recipeRows.map((row, index) => {
              const ingredient = products.find((entry) => String(entry.id) === row.productId);
              return (
                <div key={index} className="flex items-center gap-1.5">
                  <select
                    value={row.productId}
                    onChange={(event) =>
                      setRecipeRows((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, productId: event.target.value } : item,
                        ),
                      )
                    }
                    aria-label="Bahan"
                    className="h-8 min-w-36 flex-1 border border-input bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    <option value="">Pilih bahan…</option>
                    {products
                      .filter((entry) => entry.id !== product?.id)
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                  </select>
                  <Input
                    value={row.qtyInput}
                    onChange={(event) =>
                      setRecipeRows((prev) =>
                        prev.map((item, i) =>
                          i === index
                            ? { ...item, qtyInput: event.target.value.replace(/[^\d]/g, "") }
                            : item,
                        ),
                      )
                    }
                    inputMode="numeric"
                    aria-label="Jumlah bahan"
                    className="h-8 w-16 rounded-none border-border text-right font-mono text-xs"
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {ingredient?.unit ?? "pcs"}
                  </span>
                  <button
                    type="button"
                    aria-label="Hapus bahan"
                    onClick={() => setRecipeRows((prev) => prev.filter((_, i) => i !== index))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setRecipeRows((prev) => [...prev, { productId: "", qtyInput: "1" }])}
              className="text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              + Tambah bahan
            </button>
            <p className="text-[11px] text-muted-foreground">
              Produk berresep memotong stok bahannya saat terjual, bukan stok produknya
              sendiri; refund mengembalikan bahan yang sama.
            </p>
          </div>

          {error ? (
            <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="animate-spin" /> : null}
            {editing ? "Simpan perubahan" : "Tambah produk"}
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