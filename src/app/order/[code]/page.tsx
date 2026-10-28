import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, products, stores, storeTables } from "@/lib/db/schema";
import { SelfOrderScreen } from "@/components/self-order/self-order-screen";

type PageProps = { params: Promise<{ code: string }>; searchParams: Promise<{ table?: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  return { title: `Pesan · ${code}`, robots: { index: false } };
}

export default async function SelfOrderPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const { table } = await searchParams;

  const storeCode = code.toLowerCase();
  const found = await db
    .select()
    .from(stores)
    .where(and(eq(stores.code, storeCode), eq(stores.active, true)))
    .limit(1);
  const store = found[0];
  if (!store) notFound();

  const tableId = table ? Number(table) : null;
  let tableName: string | null = null;
  if (tableId && Number.isInteger(tableId)) {
    const tableRow = await db
      .select({ name: storeTables.name })
      .from(storeTables)
      .where(and(eq(storeTables.id, tableId), eq(storeTables.storeId, store.id)))
      .limit(1);
    tableName = tableRow[0]?.name ?? null;
  }

  const [catalog, cats] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        unit: products.unit,
        options: products.options,
        categoryId: products.categoryId,
      })
      .from(products)
      .where(and(eq(products.storeId, store.id), eq(products.active, true)))
      .orderBy(asc(products.name)),
    db
      .select({ id: categories.id, name: categories.name, color: categories.color })
      .from(categories)
      .where(eq(categories.storeId, store.id))
      .orderBy(asc(categories.sortOrder)),
  ]);

  return (
    <SelfOrderScreen
      storeCode={store.code}
      storeName={store.name}
      tableId={tableName ? tableId : null}
      tableName={tableName}
      products={catalog}
      categories={cats}
      currency={store.currency}
    />
  );
}
