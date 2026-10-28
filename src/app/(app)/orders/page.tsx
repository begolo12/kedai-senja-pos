import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, like, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, orders, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatDateTime, formatMoney } from "@/lib/money";
import { readDateRange } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Pesanan" };

const STATUS = [
  { value: "all", label: "Semua" },
  { value: "completed", label: "Selesai" },
  { value: "partially_refunded", label: "Refund parsial" },
  { value: "refunded", label: "Refund" },
] as const;

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const { store } = await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const status = typeof params.status === "string" ? params.status : "all";
  const range =
    typeof params.from === "string" && typeof params.to === "string"
      ? readDateRange({ from: params.from, to: params.to })
      : readDateRange({ range: "7d" });
  const settings = await getSettings(store.id);

  const from = new Date(`${range.from}T00:00:00+07:00`);
  const to = new Date(`${range.to}T00:00:00+07:00`);
  to.setDate(to.getDate() + 1);

  const filters = [
    eq(orders.storeId, store.id),
    gte(orders.createdAt, from),
    lt(orders.createdAt, to),
    STATUS.some((s) => s.value === status && status !== "all")
      ? eq(orders.status, status as "completed" | "partially_refunded" | "refunded")
      : undefined,
    q
      ? or(like(orders.number, `%${q}%`), like(customers.name, `%${q}%`))
      : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      id: orders.id,
      number: orders.number,
      total: orders.total,
      status: orders.status,
      method: orders.paymentMethod,
      createdAt: orders.createdAt,
      cashier: users.name,
      customer: customers.name,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(...filters))
    .orderBy(desc(orders.createdAt))
    .limit(100);

  const totals = (await db
    .select({
      count: sql<number>`count(*)`,
      revenue: sql<number>`coalesce(sum(case when ${orders.status} <> 'refunded' then ${orders.total} - ${orders.refundedTotal} else 0 end), 0)`,
      refunds: sql<number>`coalesce(sum(${orders.refundedTotal}), 0)`,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(...filters))
    )[0]!;



  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Buku transaksi"
        title="Pesanan"
        description="Semua transaksi tersimpan. Refund mengembalikan stok dan poin pelanggan."
      />

      <form className="flex flex-wrap items-end gap-2 border border-border bg-card px-3 py-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="mb-1 block text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Cari
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="Nomor pesanan atau pelanggan" className="h-8" />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="h-8 border border-input bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          >
            {STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="from" className="mb-1 block text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Dari
          </label>
          <Input id="from" name="from" type="date" defaultValue={range.from} className="h-8 w-36" />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Sampai
          </label>
          <Input id="to" name="to" type="date" defaultValue={range.to} className="h-8 w-36" />
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-8">
          Terapkan
        </Button>
      </form>

      <section className="grid gap-px border border-border bg-border sm:grid-cols-3">
        <Summary label="Pesanan" value={String(totals.count)} />
        <Summary label="Nilai selesai" value={formatMoney(Number(totals.revenue), settings.currency)} />
        <Summary label="Nilai refund" value={formatMoney(Number(totals.refunds), settings.currency)} />
      </section>

      <section className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">Nomor</th>
              <th className="px-4 py-2.5 font-medium">Waktu</th>
              <th className="px-4 py-2.5 font-medium">Kasir</th>
              <th className="px-4 py-2.5 font-medium">Pelanggan</th>
              <th className="px-4 py-2.5 font-medium">Bayar</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => (
              <tr key={order.id} className="border-b border-border/70 last:border-0 hover:bg-muted/40">
                <td className="px-4 py-2.5">
                  <Link href={`/orders/${order.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                    {order.number}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</td>
                <td className="px-4 py-2.5 text-xs">{order.cashier}</td>
                <td className="px-4 py-2.5 text-xs">{order.customer ?? "Umum"}</td>
                <td className="px-4 py-2.5">
                  <span className="stamp border-border text-muted-foreground">{order.method}</span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs tabular">
                  {formatMoney(order.total, settings.currency)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {order.status === "refunded" ? (
                    <span className="stamp border-destructive/40 text-destructive">Refund</span>
                  ) : order.status === "partially_refunded" ? (
                    <span className="stamp border-signal/50 text-signal">Parsial</span>
                  ) : (
                    <span className="stamp border-border text-muted-foreground">Selesai</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Tidak ada pesanan pada filter ini.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
      <p className="text-[11px] text-muted-foreground">Maksimal 100 pesanan terbaru pada rentang ini.</p>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-mono text-lg tabular">{value}</p>
    </div>
  );
}