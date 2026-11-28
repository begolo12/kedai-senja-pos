import type { Metadata } from "next";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { orders, products, stores, userStores, users } from "@/lib/db/schema";
import { requireSuperAdmin } from "@/lib/auth";
import { dayStart } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader, SectionLabel } from "@/components/shared/page-header";
import { StoreDialog } from "@/components/stores/store-dialog";

export const metadata: Metadata = { title: "Daftar Toko · Back Office" };

export default async function AdminStoresPage() {
  await requireSuperAdmin();

  const [rows, productStats, orderStats, storeMembers] = await Promise.all([
    db.select().from(stores).orderBy(asc(stores.name)),
    db
      .select({
        storeId: products.storeId,
        count: sql<string>`count(*)`,
      })
      .from(products)
      .groupBy(products.storeId),
    db
      .select({
        storeId: orders.storeId,
        count: sql<string>`count(*)`,
        revenue: sql<string>`coalesce(sum(${orders.total}), 0)`,
      })
      .from(orders)
      .where(and(eq(orders.status, "completed"), gte(orders.createdAt, new Date(dayStart()))))
      .groupBy(orders.storeId),
    db
      .select({
        storeId: userStores.storeId,
        username: users.username,
        name: users.name,
      })
      .from(userStores)
      .innerJoin(users, eq(userStores.userId, users.id)),
  ]);

  const productMap = new Map(productStats.map((row) => [row.storeId, row]));
  const orderMap = new Map(orderStats.map((row) => [row.storeId, row]));
  const membersMap = new Map<number, string[]>();
  for (const m of storeMembers) {
    const list = membersMap.get(m.storeId) ?? [];
    list.push(`@${m.username}`);
    membersMap.set(m.storeId, list);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Back Office · Multi-Tenant"
        title="Daftar Toko"
        description="Pantau seluruh toko pembeli & toko demo beserta pemilik ID dan transaksi hari ini."
        actions={<StoreDialog allowCopyMenu={false} />}
      />

      <section className="grid gap-px border border-border bg-border sm:grid-cols-3">
        <Stat label="Total toko" value={String(rows.length)} />
        <Stat label="Toko aktif" value={String(rows.filter((s) => s.active).length)} />
        <Stat
          label="Total order hari ini"
          value={String(orderStats.reduce((sum, item) => sum + Number(item.count), 0))}
        />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((store) => {
          const product = productMap.get(store.id);
          const order = orderMap.get(store.id);
          const members = membersMap.get(store.id) ?? [];
          return (
            <section
              key={store.id}
              className="flex min-w-0 flex-col justify-between border border-border bg-card p-5 shadow-[3px_3px_0_0_var(--border)]"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <SectionLabel>{store.code}</SectionLabel>
                    <h2 className="font-serif text-2xl leading-tight">{store.name}</h2>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!store.active ? (
                      <span className="stamp border-destructive/40 text-destructive">Nonaktif</span>
                    ) : (
                      <span className="stamp border-signal/40 text-signal">Aktif</span>
                    )}
                    <StoreDialog
                      allowCopyMenu={false}
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
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  <span>{store.address || "Alamat belum diisi"}</span>
                </p>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  Akun tertaut: {members.length > 0 ? members.join(", ") : "belum ada"}
                </p>
                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                  <div>
                    <dt className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      Produk
                    </dt>
                    <dd className="mt-1 font-mono">{product?.count ?? "0"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      Order hari ini
                    </dt>
                    <dd className="mt-1 font-mono">{order?.count ?? "0"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      Omzet hari ini
                    </dt>
                    <dd className="mt-1 font-mono">
                      {formatMoney(Number(order?.revenue ?? 0), store.currency)}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>
          );
        })}
      </div>
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
