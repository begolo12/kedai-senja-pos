import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Printer } from "lucide-react";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/receipt/print-button";
import { BarcodeSvg } from "@/components/barcode-svg";

export const metadata: Metadata = { title: "Label Barcode" };

type PageProps = {
  searchParams: Promise<{ ids?: string }>;
};

/** Lembar label barcode 40×25 mm (rakalan 12 label per A4). */
export default async function LabelPage({ searchParams }: PageProps) {
  const { store } = await requireAdmin();
  const settings = await getSettings(store.id);
  const { ids } = await searchParams;

  const wanted = (ids ?? "")
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      price: products.price,
    })
    .from(products)
    .where(
      wanted.length > 0
        ? and(eq(products.storeId, store.id), inArray(products.id, wanted))
        : and(eq(products.storeId, store.id), eq(products.active, true)),
    )
    .orderBy(asc(products.name));

  const labels = rows.filter((row) => row.barcode);

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href="/products"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Produk
        </Link>
        <PrintButton label="Cetak label" />
      </div>
      <style>{`@media print { @page { size: A4; margin: 8mm; } }`}</style>

      {labels.length === 0 ? (
        <div className="border border-dashed px-6 py-12 text-center text-sm text-muted-foreground print:hidden">
          Tidak ada produk dengan barcode. Isi kolom barcode di halaman Produk.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-[3mm] print:grid-cols-4">
          {labels.map((label) => (
            <div
              key={label.id}
              className="flex h-[25mm] w-[40mm] flex-col justify-between border border-[#c9c0b1] px-[2mm] py-[1.5mm] text-[#1e1b16] print:border-[#1e1b16]"
            >
              <p className="truncate text-[8px] leading-tight font-semibold">
                {label.name}
              </p>
              <div className="text-[#1e1b16]">
                <BarcodeSvg value={label.barcode!} height={26} moduleWidth={1} showText />
              </div>
              <p className="flex items-baseline justify-between text-[8px]">
                <span className="truncate">{settings.storeName}</span>
                <span className="font-mono">{formatMoney(label.price, settings.currency)}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
