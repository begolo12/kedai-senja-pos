import type { Metadata } from "next";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, stockMovements, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StockAdjustDialog } from "@/components/inventory/stock-adjust-dialog";

export const metadata: Metadata = { title: "Stok" };

const REASON_LABEL: Record<string, string> = {
  sale: "Penjualan",
  refund: "Refund",
  restock: "Restock",
  correction: "Koreksi",
  waste: "Rusak",
};

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const { user, store } = await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const settings = await getSettings(store.id);

  const filters = and(
    eq(products.storeId, store.id),
    q ? or(like(products.name, `%${q}%`), like(products.sku, `%${q}%`)) : undefined,
  );

  const rows = await db
    .select()
    .from(products)
    .where(filters)
    .orderBy(products.stock, products.name);

  const stats = (await db
    .select({
      skus: sql<number>`count(*)`,
      low: sql<number>`sum(case when ${products.active} = true and ${products.stock} <= ${products.lowStockAt} and ${products.stock} > 0 then 1 else 0 end)`,
      out: sql<number>`sum(case when ${products.stock} = 0 then 1 else 0 end)`,
      value: sql<number>`coalesce(sum(${products.stock} * ${products.cost}), 0)`,
    })
    .from(products)
    .where(eq(products.storeId, store.id))
    )[0]!;

  const movements = await db
    .select({
      movement: stockMovements,
      productName: products.name,
      unit: products.unit,
      userName: users.name,
    })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .leftJoin(users, eq(stockMovements.userId, users.id))
    .where(eq(stockMovements.storeId, store.id))
    .orderBy(desc(stockMovements.createdAt))
    .limit(40);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Gudang"
        title="Stok"
        description="Setiap perubahan stok tercatat dengan alasan dan nama staf."
      />

      <section className="grid gap-px border border-border bg-border sm:grid-cols-4">
        <Stat label="SKU" value={String(stats.skus)} />
        <Stat label="Menipis" value={String(stats.low ?? 0)} />
        <Stat label="Habis" value={String(stats.out ?? 0)} />
        <Stat label="Nilai stok" value={formatMoney(Number(stats.value), settings.currency)} />
      </section>

      <form className="flex items-end gap-2 border border-border bg-card px-3 py-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="mb-1 block text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Cari
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="Nama atau SKU" className="h-8" />
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-8">
          Terapkan
        </Button>
      </form>

      <section className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">Produk</th>
              <th className="px-4 py-2.5 text-right font-medium">Stok</th>
              <th className="px-4 py-2.5 text-right font-medium">Batas</th>
              <th className="px-4 py-2.5 text-right font-medium">Nilai</th>
              <th className="px-4 py-2.5 text-right font-medium">Status</th>
              {user.role === "admin" ? <th className="px-4 py-2.5" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => {
              const low = product.stock <= product.lowStockAt;
              return (
                <tr key={product.id} className="border-b border-border/70 last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <p className={product.active ? "" : "text-muted-foreground line-through"}>{product.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{product.sku}</p>
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono text-xs ${low ? "text-destructive" : ""}`}>
                    {formatNumber(product.stock)} {product.unit}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                    {product.lowStockAt}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {formatMoney(product.stock * product.cost, settings.currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {product.stock === 0 ? (
                      <span className="stamp border-destructive/40 text-destructive">Habis</span>
                    ) : low ? (
                      <span className="stamp border-signal/40 text-signal">Menipis</span>
                    ) : (
                      <span className="stamp border-border text-muted-foreground">Aman</span>
                    )}
                  </td>
                  {user.role === "admin" ? (
                    <td className="px-4 py-2.5 text-right">
                      <StockAdjustDialog
                        productId={product.id}
                        name={product.name}
                        stock={product.stock}
                        unit={product.unit}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Jejak audit</p>
          <h2 className="font-serif text-2xl leading-none">Pergerakan stok</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                <th className="px-5 py-2 font-medium">Waktu</th>
                <th className="px-3 py-2 font-medium">Produk</th>
                <th className="px-3 py-2 font-medium">Alasan</th>
                <th className="px-3 py-2 font-medium">Oleh</th>
                <th className="px-3 py-2 font-medium">Catatan</th>
                <th className="px-5 py-2 text-right font-medium">Perubahan</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(({ movement, productName, unit, userName }) => (
                <tr key={movement.id} className="border-b border-border/70 last:border-0">
                  <td className="px-5 py-2 text-xs text-muted-foreground">{formatDateTime(movement.createdAt)}</td>
                  <td className="px-3 py-2 text-xs">{productName}</td>
                  <td className="px-3 py-2">
                    <span className="stamp border-border text-muted-foreground">
                      {REASON_LABEL[movement.reason] ?? movement.reason}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{userName ?? "Sistem"}</td>
                  <td className="max-w-52 truncate px-3 py-2 text-xs text-muted-foreground">
                    {movement.note || "—"}
                  </td>
                  <td
                    className={`px-5 py-2 text-right font-mono text-xs ${
                      movement.delta > 0 ? "text-signal" : "text-muted-foreground"
                    }`}
                  >
                    {movement.delta > 0 ? "+" : ""}
                    {movement.delta} {unit}
                  </td>
                </tr>
              ))}
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Belum ada pergerakan stok.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-mono text-lg tabular">{value}</p>
    </div>
  );
}