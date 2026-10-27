import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, customers, products } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getOpenShift } from "@/lib/shifts";
import { Button } from "@/components/ui/button";
import { PosTerminal } from "@/components/pos/terminal";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Kasir" };

export default async function PosPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const shift = await getOpenShift(user.id);

  if (!shift) {
    return (
      <div className="mx-auto max-w-xl pt-10">
        <div className="border border-border bg-card px-6 py-10 text-center">
          <LockKeyhole className="mx-auto size-7 text-muted-foreground" strokeWidth={1.4} />
          <h1 className="mt-4 font-serif text-3xl">Kasir terkunci</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Setiap transaksi harus masuk ke sebuah shift. Buka shift dengan kas awal
            laci, lalu kembali ke kasir.
          </p>
          <Button nativeButton={false} render={<Link href="/shift" />} className="mt-6 bg-signal text-signal-foreground hover:bg-signal/90">
            Buka shift sekarang
          </Button>
        </div>
      </div>
    );
  }

  const catalog = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      price: products.price,
      stock: products.stock,
      unit: products.unit,
      categoryId: products.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.active, true))
    .orderBy(asc(products.name));

  const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  const customerList = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      points: customers.points,
    })
    .from(customers)
    .orderBy(asc(customers.name));

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow={`Shift ${shift.id} · kas awal ${new Intl.NumberFormat("id-ID").format(shift.openingFloat / 100)}`}
        title="Kasir"
        description="Pindai barcode atau ketik nama. Enter menambahkan hasil teratas."
        className="mb-5"
      />
      <PosTerminal
        products={catalog}
        categories={cats}
        customers={customerList}
        currency={settings.currency}
        taxRate={settings.taxRate}
      />
    </div>
  );
}