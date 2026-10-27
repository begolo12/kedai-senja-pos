import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { readDateRange, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, SectionLabel } from "@/components/shared/page-header";
import { RevenueBars, type RevenuePoint } from "@/components/charts/revenue-bars";

export const metadata: Metadata = { title: "Laporan" };

const PRESETS = [
  { value: "today", label: "Hari ini" },
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
];

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requireAdmin();
  const params = await searchParams;
  const range = readDateRange({
    from: typeof params.from === "string" ? params.from : undefined,
    to: typeof params.to === "string" ? params.to : undefined,
    range: typeof params.range === "string" ? params.range : "7d",
  });
  const settings = await getSettings();

  const start = new Date(`${range.from}T00:00:00+07:00`).getTime();
  const end = new Date(`${range.to}T00:00:00+07:00`).getTime() + 86_400_000;

  const summary = (await rows<{
    revenue: number;
    tax: number;
    cost: number;
    discount: number;
    orders: number;
  }>(sql`
    select coalesce(sum(total), 0) as revenue,
           coalesce(sum(tax_amount), 0) as tax,
           coalesce(sum(cost_total), 0) as cost,
           coalesce(sum(discount_amount), 0) as discount,
           count(*) as orders
    from orders
    where status = 'completed' and created_at >= ${new Date(start)} and created_at < ${new Date(end)}
  `))[0];

  const refunds = (await rows<{ count: number; value: number }>(sql`
    select count(*) as count, coalesce(sum(total), 0) as value
    from orders
    where status = 'refunded' and created_at >= ${new Date(start)} and created_at < ${new Date(end)}
  `))[0];

  const rawSeries = await rows<RevenuePoint>(sql`
    select to_char(created_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as day,
           coalesce(sum(total), 0) as revenue,
           count(*) as orders
    from orders
    where status = 'completed' and created_at >= ${new Date(start)} and created_at < ${new Date(end)}
    group by 1
    order by 1
  `);
  const seriesRows = rawSeries.map((point) => ({
    ...point,
    revenue: Number(point.revenue),
    orders: Number(point.orders),
  }));
  const seriesMap = new Map(seriesRows.map((point) => [point.day, point]));
  const series: RevenuePoint[] = [];
  const cursor = new Date(`${range.from}T00:00:00Z`);
  const last = new Date(`${range.to}T00:00:00Z`);
  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    series.push(seriesMap.get(key) ?? { day: key, revenue: 0, orders: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const payments = await rows<{ method: string; revenue: number; orders: number }>(sql`
    select payment_method as method, coalesce(sum(total), 0) as revenue, count(*) as orders
    from orders
    where status = 'completed' and created_at >= ${new Date(start)} and created_at < ${new Date(end)}
    group by payment_method
    order by revenue desc
  `);

  const topProducts = await rows<{ name: string; qty: number; revenue: number; margin: number }>(sql`
    select oi.name as name,
           sum(oi.qty) as qty,
           sum(oi.line_total) as revenue,
           sum((oi.unit_price - oi.cost) * oi.qty) as margin
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.status = 'completed' and o.created_at >= ${new Date(start)} and o.created_at < ${new Date(end)}
    group by oi.name
    order by sum(oi.qty) desc
    limit 8
  `);

  const byStaff = await rows<{ name: string; orders: number; revenue: number }>(sql`
    select u.name as name, count(*) as orders, coalesce(sum(o.total), 0) as revenue
    from orders o
    join users u on u.id = o.user_id
    where o.status = 'completed' and o.created_at >= ${new Date(start)} and o.created_at < ${new Date(end)}
    group by u.name
    order by revenue desc
  `);

  const byCategory = await rows<{ name: string; revenue: number; qty: number }>(sql`
    select coalesce(c.name, 'Tanpa kategori') as name,
           coalesce(sum(oi.line_total), 0) as revenue,
           coalesce(sum(oi.qty), 0) as qty
    from order_items oi
    join orders o on o.id = oi.order_id
    left join products p on p.id = oi.product_id
    left join categories c on c.id = p.category_id
    where o.status = 'completed' and o.created_at >= ${new Date(start)} and o.created_at < ${new Date(end)}
    group by c.name
    order by revenue desc
  `);

  const revenue = Number(summary?.revenue ?? 0);
  const tax = Number(summary?.tax ?? 0);
  const cost = Number(summary?.cost ?? 0);
  const orders = Number(summary?.orders ?? 0);
  const profit = revenue - tax - cost;
  const avg = orders > 0 ? Math.round(revenue / orders) : 0;
  const maxPayment = Math.max(1, ...payments.map((p) => Number(p.revenue)));
  const maxCategory = Math.max(1, ...byCategory.map((c) => Number(c.revenue)));
  const exportUrl = `/api/reports/export?from=${range.from}&to=${range.to}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={`${range.from} → ${range.to}`}
        title="Laporan"
        description="Hanya pesanan berstatus selesai yang dihitung sebagai pendapatan. Refund terpisah."
        actions={
          <Button nativeButton={false} variant="outline" size="sm" render={<a href={exportUrl} />}>
            Unduh CSV
          </Button>
        }
      />

      <form className="flex flex-wrap items-end gap-2 border border-border bg-card px-3 py-3">
        <div>
          <label htmlFor="from" className="mb-1 block text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Dari
          </label>
          <Input id="from" name="from" type="date" defaultValue={range.from} max={todayIso()} className="h-8 w-36" />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Sampai
          </label>
          <Input id="to" name="to" type="date" defaultValue={range.to} max={todayIso()} className="h-8 w-36" />
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-8">
          Terapkan
        </Button>
        <div className="ml-auto flex gap-1">
          {PRESETS.map((preset) => (
            <Link
              key={preset.value}
              href={`/reports?range=${preset.value}`}
              className={`border px-2 py-1 text-[11px] ${
                range.preset === preset.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {preset.label}
            </Link>
          ))}
        </div>
      </form>

      <section className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Pendapatan" value={formatMoney(revenue, settings.currency)} note={`${orders} pesanan selesai`} accent />
        <Kpi label="Laba kotor" value={formatMoney(profit, settings.currency)} note={`Margin ${revenue > 0 ? Math.round((profit / revenue) * 100) : 0}%`} />
        <Kpi label="Rata-rata / pesanan" value={formatMoney(avg, settings.currency)} note={`Diskon ${formatMoney(Number(summary?.discount ?? 0), settings.currency)}`} />
        <Kpi label="Refund" value={formatMoney(Number(refunds?.value ?? 0), settings.currency)} note={`${refunds?.count ?? 0} pesanan dikembalikan`} />
      </section>

      <section className="border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <SectionLabel>Harian</SectionLabel>
            <h2 className="font-serif text-2xl leading-none">Pendapatan per hari</h2>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            Pajak {formatMoney(tax, settings.currency)} · Modal {formatMoney(cost, settings.currency)}
          </p>
        </div>
        <RevenueBars data={series} height={260} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <SectionLabel>Komposisi</SectionLabel>
            <h2 className="font-serif text-2xl leading-none">Metode pembayaran</h2>
          </div>
          <div className="space-y-3 px-5 py-4">
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada transaksi.</p>
            ) : (
              payments.map((payment) => (
                <div key={payment.method}>
                  <div className="flex justify-between text-xs">
                    <span className="uppercase">{payment.method}</span>
                    <span className="font-mono">
                      {formatMoney(Number(payment.revenue), settings.currency)}
                      <span className="ml-2 text-muted-foreground">{payment.orders}×</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 bg-muted">
                    <div className="h-full bg-chart-1" style={{ width: `${(Number(payment.revenue) / maxPayment) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <SectionLabel>Kategori</SectionLabel>
            <h2 className="font-serif text-2xl leading-none">Pendapatan per kategori</h2>
          </div>
          <div className="space-y-3 px-5 py-4">
            {byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada penjualan.</p>
            ) : (
              byCategory.map((category) => (
                <div key={category.name}>
                  <div className="flex justify-between text-xs">
                    <span>{category.name}</span>
                    <span className="font-mono">
                      {formatMoney(Number(category.revenue), settings.currency)}
                      <span className="ml-2 text-muted-foreground">{category.qty} item</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 bg-muted">
                    <div className="h-full bg-chart-3" style={{ width: `${(Number(category.revenue) / maxCategory) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <SectionLabel>Produk</SectionLabel>
            <h2 className="font-serif text-2xl leading-none">Paling laku</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th className="px-5 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Produk</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Omzet</th>
                  <th className="px-5 py-2 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product, index) => (
                  <tr key={product.name} className="border-b border-border/70 last:border-0">
                    <td className="px-5 py-2 font-serif text-muted-foreground">{String(index + 1).padStart(2, "0")}</td>
                    <td className="px-3 py-2">{product.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{product.qty}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatMoney(Number(product.revenue), settings.currency)}
                    </td>
                    <td className="px-5 py-2 text-right font-mono text-xs">
                      {formatMoney(Number(product.margin), settings.currency)}
                    </td>
                  </tr>
                ))}
                {topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                      Belum ada penjualan.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <SectionLabel>Tim</SectionLabel>
            <h2 className="font-serif text-2xl leading-none">Per kasir</h2>
          </div>
          <ul className="divide-y divide-border">
            {byStaff.map((staff) => (
              <li key={staff.name} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm">{staff.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{staff.orders} pesanan</p>
                </div>
                <span className="font-mono text-xs">{formatMoney(Number(staff.revenue), settings.currency)}</span>
              </li>
            ))}
            {byStaff.length === 0 ? (
              <li className="px-5 py-8 text-sm text-muted-foreground">Belum ada data.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div className={`bg-card px-5 py-4 ${accent ? "border-t-2 border-t-signal" : ""}`}>
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 font-mono text-2xl tracking-tight tabular">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}