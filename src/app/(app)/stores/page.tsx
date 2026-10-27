import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { ArrowRight, MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { orders, products, stores } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { dayStart } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { chooseStoreAction } from "@/lib/actions/stores";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionLabel } from "@/components/shared/page-header";
import { StoreDialog } from "@/components/stores/store-dialog";

export const metadata: Metadata = { title: "Toko" };

export default async function StoresPage() {
  const { store: activeStore } = await requireAdmin();
  const rows = await db.select().from(stores).orderBy(asc(stores.name));

  const productStats = await db
    .select({
      storeId: products.storeId,
      count: sql<string>`count(*)`,
      low: sql<string>`sum(case when ${products.active} = true and ${products.stock} <= ${products.lowStockAt} then 1 else 0 end)`,
    })
    .from(products)
    .groupBy(products.storeId);

  const orderStats = await db
    .select({
      storeId: orders.storeId,
      count: sql<string>`count(*)`,
      revenue: sql<string>`coalesce(sum(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, "completed"),
        gte(orders.createdAt, new Date(dayStart())),
      ),
    )
    .groupBy(orders.storeId);

  const productMap = new Map(productStats.map((row) => [row.storeId, row]));
  const orderMap = new Map(orderStats.map((row) => [row.storeId, row]));
  const activeCount = rows.filter((store) => store.active).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Manajemen · semua toko"
        title="Toko"
        description="Satu akun manajemen bisa membuka semua toko. Setiap toko punya menu, stok, pesanan, kasir, QRIS, dan laporan sendiri."
        actions={<StoreDialog />}
      />

      <section className="grid gap-px border border-border bg-border sm:grid-cols-3">
        <Stat label="Total toko" value={String(rows.length)} />
        <Stat label="Toko aktif" value={String(activeCount)} />
        <Stat label="Toko sekarang" value={activeStore.name} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((store) => {
          const product = productMap.get(store.id);
          const order = orderMap.get(store.id);
          const current = store.id === activeStore.id;
          return (
            <section
              key={store.id}
              className="flex flex-col justify-between border border-border bg-card p-5 shadow-[3px_3px_0_0_var(--border)]"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <SectionLabel>{store.code}</SectionLabel>
                    <h2 className="font-serif text-2xl leading-tight">{store.name}</h2>
                  </div>
                  <div className="flex items-center gap-1">
                    {current ? (
                      <span className="stamp border-signal/40 text-signal">Aktif</span>
                    ) : null}
                    {!store.active ? (
                      <span className="stamp border-destructive/40 text-destructive">Nonaktif</span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  <span>{store.address || "Alamat belum diisi"}</span>
                </p>
                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                  <div>
                    <dt className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Produk</dt>
                    <dd className="mt-1 font-mono">{product?.count ?? "0"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Pesanan hari ini</dt>
                    <dd className="mt-1 font-mono">{order?.count ?? "0"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Omzet</dt>
                    <dd className="mt-1 font-mono">
                      {formatMoney(Number(order?.revenue ?? 0), store.currency)}
                    </dd>
                  </div>
                </dl>
                {Number(product?.low ?? 0) > 0 ? (
                  <p className="mt-3 text-[11px] text-destructive">
                    {product?.low} produk stok menipis
                  </p>
                ) : null}
              </div>

              <div className="mt-5 flex items-center gap-2">
                <form action={chooseStoreAction} className="flex-1">
                  <input type="hidden" name="storeId" value={store.id} />
                  <Button
                    type="submit"
                    disabled={!store.active}
                    className="w-full"
                    variant={current ? "outline" : "default"}
                  >
                    {current ? "Toko aktif" : "Buka toko"} <ArrowRight />
                  </Button>
                </form>
                <StoreDialog
                  current={current}
                  store={{
                    id: store.id,
                    name: store.name,
                    code: store.code,
                    address: store.address,
                    phone: store.phone,
                    taxRate: store.taxRate,
                    receiptWidth: store.receiptWidth,
                    active: store.active,
                  }}
                />
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Atur QRIS, footer struk, dan poin per toko lewat <strong>Pengaturan</strong> setelah
        membuka toko tersebut. Tambah kasir dan pilih tokonya di <Link href="/staff" className="underline underline-offset-4">Staf</Link>.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 truncate font-mono text-lg tabular">{value}</p>
    </div>
  );
}