import type { Metadata } from "next";
import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, products } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { ProductDialog } from "@/components/products/product-dialog";
import { CategoryManager } from "@/components/products/category-manager";
import { ProductToggle } from "@/components/products/product-toggle";
import { ImportMenuDialog } from "@/components/products/import-menu-dialog";

export const metadata: Metadata = { title: "Produk" };

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const category = typeof params.category === "string" ? Number(params.category) : 0;
  const settings = await getSettings();

  const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder));

  const filters = [
    q
      ? or(
          like(products.name, `%${q}%`),
          like(products.sku, `%${q}%`),
          like(products.barcode, `%${q}%`),
        )
      : undefined,
    category ? eq(products.categoryId, category) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      product: products,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(products.name));

  const stats = (await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`sum(case when ${products.active} = true then 1 else 0 end)`,
      low: sql<number>`sum(case when ${products.active} = true and ${products.stock} <= ${products.lowStockAt} then 1 else 0 end)`,
      value: sql<number>`coalesce(sum(${products.stock} * ${products.cost}), 0)`,
    })
    .from(products)
    )[0]!;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Katalog"
        title="Produk"
        description="Harga, modal, dan stok. Produk nonaktif hilang dari kasir tapi riwayatnya tetap utuh."
        actions={
          <>
            <ImportMenuDialog />
            <CategoryManager categories={cats} />
            <ProductDialog categories={cats} />
          </>
        }
      />

      <section className="grid gap-px border border-border bg-border sm:grid-cols-4">
        <Stat label="Produk" value={String(stats.total)} />
        <Stat label="Aktif" value={String(stats.active ?? 0)} />
        <Stat label="Stok menipis" value={String(stats.low ?? 0)} tone={Number(stats.low) > 0 ? "warn" : undefined} />
        <Stat label="Nilai stok (modal)" value={formatMoney(Number(stats.value), settings.currency)} />
      </section>

      <form className="flex flex-wrap items-end gap-2 border border-border bg-card px-3 py-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="mb-1 block text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Cari produk
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="Nama, SKU, atau barcode" className="h-8" />
        </div>
        <div>
          <label htmlFor="category" className="mb-1 block text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Kategori
          </label>
          <select
            id="category"
            name="category"
            defaultValue={category || ""}
            className="h-8 border border-input bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="">Semua</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-8">
          Terapkan
        </Button>
      </form>

      <section className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">Produk</th>
              <th className="px-4 py-2.5 font-medium">Kategori</th>
              <th className="px-4 py-2.5 text-right font-medium">Harga</th>
              <th className="px-4 py-2.5 text-right font-medium">Modal</th>
              <th className="px-4 py-2.5 text-right font-medium">Margin</th>
              <th className="px-4 py-2.5 text-right font-medium">Stok</th>
              <th className="px-4 py-2.5 text-center font-medium">Jual</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ product, categoryName, categoryColor }) => {
              const margin = product.price > 0 ? Math.round(((product.price - product.cost) / product.price) * 100) : 0;
              const low = product.stock <= product.lowStockAt;
              return (
                <tr key={product.id} className="border-b border-border/70 last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{product.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {product.sku}
                      {product.barcode ? ` · ${product.barcode}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="size-2" style={{ background: categoryColor ?? "var(--border)" }} />
                      {categoryName ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {formatMoney(product.price, settings.currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                    {formatMoney(product.cost, settings.currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    <span className={margin < 30 ? "text-destructive" : "text-muted-foreground"}>{margin}%</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`font-mono text-xs ${low ? "text-destructive" : ""}`}>
                      {product.stock} {product.unit}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <ProductToggle id={product.id} active={product.active} name={product.name} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <ProductDialog
                      categories={cats}
                      product={{
                        id: product.id,
                        name: product.name,
                        sku: product.sku,
                        barcode: product.barcode,
                        categoryId: product.categoryId,
                        price: product.price,
                        cost: product.cost,
                        stock: product.stock,
                        lowStockAt: product.lowStockAt,
                        unit: product.unit,
                        options: product.options ?? "",
                        active: product.active,
                      }}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Tidak ada produk yang cocok.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className={`mt-1 font-mono text-lg tabular ${tone === "warn" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}