import Link from "next/link";
import { ArrowRight, Banknote, ChartNoAxesColumn, ReceiptText, TriangleAlert } from "lucide-react";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, rows } from "@/lib/db";
import { orderItems, orders, products, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getOpenShift } from "@/lib/shifts";
import { DAY_MS, dayStart } from "@/lib/dates";
import { formatMoney, formatTime } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionLabel } from "@/components/shared/page-header";
import { RevenueBars, type RevenuePoint } from "@/components/charts/revenue-bars";

export default async function DashboardPage() {
  const { user, store } = await requireAdmin();
  const settings = await getSettings(store.id);
  const shift = await getOpenShift(user.id, store.id);
  // Server component: the request clock is the correct source.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const today = dayStart(now);
  const yesterday = today - DAY_MS;
  const weekStart = today - 6 * DAY_MS;

  const sum = async (from: number, to: number) =>
    (
      await db
        .select({
          revenue: sql<string>`coalesce(sum(${orders.total} - ${orders.refundedTotal}), 0)`,
          cost: sql<string>`coalesce(sum(${orders.costTotal}), 0)`,
          tax: sql<string>`coalesce(sum(${orders.taxAmount}), 0)`,
          count: sql<string>`count(*)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, store.id),
            inArray(orders.status, ["completed", "partially_refunded"]),
            gte(orders.createdAt, new Date(from)),
            lt(orders.createdAt, new Date(to)),
          ),
        )
    )[0]!;

  const todayStats = await sum(today, today + DAY_MS);
  const yesterdayStats = await sum(yesterday, today);
  const revenue = Number(todayStats.revenue);
  const prevRevenue = Number(yesterdayStats.revenue);
  const delta = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null;
  const profit = revenue - Number(todayStats.tax) - Number(todayStats.cost);
  const avg = Number(todayStats.count) > 0 ? Math.round(revenue / Number(todayStats.count)) : 0;

  const rawSeries = await rows<RevenuePoint>(sql`
    select to_char(created_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as day,
           coalesce(sum(total - refunded_total), 0) as revenue,
           count(*) as orders
    from orders
    where store_id = ${store.id} and status in ('completed','partially_refunded') and created_at >= ${new Date(weekStart)}
    group by 1
    order by 1
  `);
  const series = rawSeries.map((point) => ({
    ...point,
    revenue: Number(point.revenue),
    orders: Number(point.orders),
  }));

  const recent = await db
    .select({
      id: orders.id,
      number: orders.number,
      total: orders.total,
      method: orders.paymentMethod,
      status: orders.status,
      createdAt: orders.createdAt,
      cashier: users.name,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.storeId, store.id))
    .orderBy(desc(orders.createdAt))
    .limit(6);

  const lowStock = await db
    .select({
      id: products.id,
      name: products.name,
      stock: products.stock,
      lowStockAt: products.lowStockAt,
      unit: products.unit,
    })
    .from(products)
    .where(
      and(
        eq(products.storeId, store.id),
        eq(products.active, true),
        sql`${products.stock} <= ${products.lowStockAt}`,
      ),
    )
    .orderBy(products.stock)
    .limit(5);

  const topToday = await db
    .select({
      name: orderItems.name,
      qty: sql<number>`sum(${orderItems.qty} - ${orderItems.refundedQty})`,
      revenue: sql<number>`sum((${orderItems.qty} - ${orderItems.refundedQty}) * ${orderItems.unitPrice})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.storeId, store.id),
        inArray(orders.status, ["completed", "partially_refunded"]),
        gte(orders.createdAt, new Date(today)),
      ),
    )
    .groupBy(orderItems.name)
    .orderBy(desc(sql`sum(${orderItems.qty})`))
    .limit(4);

  const dateLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow={`${store.name} · ${dateLabel}`}
        title="Ringkasan hari ini"
        description={
          shift
            ? `Shift ${shift.id} berjalan. Semua angka di bawah hanya menghitung pesanan selesai.`
            : "Belum ada shift terbuka. Buka shift agar transaksi bisa dicatat."
        }
        actions={
          <Button nativeButton={false} render={<Link href="/pos" />} className="bg-signal text-signal-foreground hover:bg-signal/90">
            Buka kasir <ArrowRight />
          </Button>
        }
      />

      {!shift ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm">
            <span className="font-medium">Shift belum dibuka.</span>{" "}
            <span className="text-muted-foreground">Kasir terkunci sampai kamu membuka shift.</span>
          </p>
          <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/shift" />}>
            Buka shift
          </Button>
        </div>
      ) : null}

      <section className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Pendapatan"
          value={formatMoney(revenue, settings.currency)}
          note={
            delta === null
              ? "Belum ada pembanding kemarin"
              : `${delta >= 0 ? "Naik" : "Turun"} ${Math.abs(delta)}% dari kemarin`
          }
          accent
          icon={<Banknote className="size-4" strokeWidth={1.6} />}
        />
        <Kpi
          label="Pesanan"
          value={String(todayStats.count)}
          note={`Rata-rata ${formatMoney(avg, settings.currency)}`}
          icon={<ReceiptText className="size-4" strokeWidth={1.6} />}
        />
        <Kpi
          label="Laba kotor"
          value={formatMoney(profit, settings.currency)}
          note={`Setelah modal, sebelum pajak ${formatMoney(Number(todayStats.tax), settings.currency)}`}
          icon={<ChartNoAxesColumn className="size-4" strokeWidth={1.6} />}
        />
        <Kpi
          label="Stok menipis"
          value={String(lowStock.length)}
          note={lowStock.length ? `Terendah: ${lowStock[0].name}` : "Semua stok aman"}
          icon={<TriangleAlert className="size-4" strokeWidth={1.6} />}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <section className="border border-border bg-card p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <SectionLabel>Tujuh hari terakhir</SectionLabel>
              <h2 className="font-serif text-2xl leading-none">Arus pendapatan</h2>
            </div>
            <Link
              href="/reports"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Laporan lengkap
            </Link>
          </div>
          <RevenueBars data={series} />
        </section>

        <section className="flex flex-col border border-border bg-card">
          <div className="flex items-baseline justify-between border-b border-border px-5 py-4">
            <div>
              <SectionLabel>Perlu restock</SectionLabel>
              <h2 className="font-serif text-2xl leading-none">Stok menipis</h2>
            </div>
            <Link href="/inventory" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              Kelola
            </Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              Tidak ada produk di bawah batas stok.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Batas {p.lowStockAt} {p.unit}
                    </p>
                  </div>
                  <span
                    className={`font-mono text-sm tabular ${p.stock === 0 ? "text-destructive" : "text-signal"}`}
                  >
                    {p.stock} {p.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <section className="border border-border bg-card">
          <div className="flex items-baseline justify-between border-b border-border px-5 py-4">
            <div>
              <SectionLabel>Buku kas</SectionLabel>
              <h2 className="font-serif text-2xl leading-none">Pesanan terbaru</h2>
            </div>
            <Link href="/orders" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              Semua
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {recent.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs">{order.number}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {formatTime(order.createdAt)} · {order.cashier} · {(order.method ?? "tagihan").toUpperCase()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {order.status === "refunded" ? (
                      <span className="stamp border-destructive/40 text-destructive">Refund</span>
                    ) : order.status === "partially_refunded" ? (
                      <span className="stamp border-signal/50 text-signal">Parsial</span>
                    ) : null}
                    <span className="font-mono text-sm tabular">
                      {formatMoney(order.total, settings.currency)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <SectionLabel>Hari ini</SectionLabel>
            <h2 className="font-serif text-2xl leading-none">Paling laku</h2>
          </div>
          {topToday.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              Belum ada penjualan hari ini.
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {topToday.map((item, index) => (
                <li key={item.name} className="flex items-center gap-4 px-5 py-3">
                  <span className="font-serif text-lg text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{item.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {item.qty} terjual
                    </p>
                  </div>
                  <span className="font-mono text-xs tabular">
                    {formatMoney(Number(item.revenue), settings.currency)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  note,
  icon,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`bg-card px-5 py-5 ${accent ? "border-t-2 border-t-signal sm:border-t-2" : ""}`}>
      <div className="flex items-center justify-between text-muted-foreground">
        <p className="text-[11px] tracking-[0.16em] uppercase">{label}</p>
        {icon}
      </div>
      <p className="mt-3 font-mono text-2xl tracking-tight tabular">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}