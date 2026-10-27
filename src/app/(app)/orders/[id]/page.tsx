import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer, UserRound } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, orderItems, orders, shifts, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatDateTime, formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionLabel } from "@/components/shared/page-header";
import { RefundButton } from "@/components/orders/refund-button";

export default async function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  const user = await requireAdmin();
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();

  const row = (await db
    .select({
      order: orders,
      cashier: users.name,
      customerName: customers.name,
      customerPhone: customers.phone,
      shiftId: shifts.id,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(shifts, eq(orders.shiftId, shifts.id))
    .where(eq(orders.id, orderId))
    )[0];
  if (!row) notFound();

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const settings = await getSettings();
  const order = row.order;
  const refunder = order.refundedBy
    ? (await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, order.refundedBy))
        .limit(1))[0]
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> Semua pesanan
      </Link>

      <PageHeader
        eyebrow={formatDateTime(order.createdAt)}
        title={order.number}
        description={`${row.cashier} · Shift ${row.shiftId ?? "—"} · ${order.paymentMethod.toUpperCase()}`}
        actions={
          <>
            <Button nativeButton={false} variant="outline" render={<Link href={`/receipt/${order.id}`} />}>
              <Printer /> Struk
            </Button>
            {user.role === "admin" && order.status === "completed" ? (
              <RefundButton orderId={order.id} number={order.number} />
            ) : null}
          </>
        }
      />

      {order.status === "refunded" ? (
        <div className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Pesanan ini sudah direfund.</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {order.refundedAt ? formatDateTime(order.refundedAt) : ""}
            {refunder ? ` oleh ${refunder.name}` : ""}. Stok sudah dikembalikan.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="border border-border bg-card">
          <div className="border-b border-border px-5 py-3.5">
            <SectionLabel>Item</SectionLabel>
            <h2 className="font-serif text-xl leading-none">{items.length} baris</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                <th className="px-5 py-2 font-medium">Produk</th>
                <th className="px-3 py-2 text-center font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Harga</th>
                <th className="px-5 py-2 text-right font-medium">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border/70 last:border-0">
                  <td className="px-5 py-2.5">
                    <p>{item.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{item.sku}</p>
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono text-xs">{item.qty}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {formatMoney(item.unitPrice, settings.currency)}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono text-xs">
                    {formatMoney(item.lineTotal, settings.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="space-y-1 border-t border-border px-5 py-4 text-sm">
            <Row label="Subtotal" value={formatMoney(order.subtotal, settings.currency)} />
            {order.discountAmount > 0 ? (
              <Row
                label={`Diskon${order.discountType === "percent" ? ` (${order.discountValue}%)` : ""}`}
                value={`−${formatMoney(order.discountAmount, settings.currency)}`}
              />
            ) : null}
            <Row label={`Pajak ${(settings.taxRate / 100).toLocaleString("id-ID")}%`} value={formatMoney(order.taxAmount, settings.currency)} />
            <div className="flex justify-between border-t border-border pt-2 font-medium">
              <dt>Total</dt>
              <dd className="font-mono text-lg tabular">{formatMoney(order.total, settings.currency)}</dd>
            </div>
            <Row label="Dibayar" value={formatMoney(order.amountPaid, settings.currency)} />
            <Row label="Kembalian" value={formatMoney(order.changeDue, settings.currency)} />
          </dl>
        </section>

        <section className="space-y-4">
          <div className="border border-border bg-card px-5 py-4">
            <SectionLabel>Pelanggan</SectionLabel>
            {row.customerName ? (
              <div className="flex items-start gap-2">
                <UserRound className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm">{row.customerName}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {row.customerPhone ?? "—"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Pelanggan umum, tanpa poin.</p>
            )}
          </div>

          <div className="border border-border bg-card px-5 py-4">
            <SectionLabel>Catatan</SectionLabel>
            <p className="text-sm text-muted-foreground">
              {order.note?.trim() ? order.note : "Tidak ada catatan."}
            </p>
          </div>

          <div className="border border-border bg-card px-5 py-4">
            <SectionLabel>Ringkasan</SectionLabel>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Metode</dt>
                <dd className="uppercase">{order.paymentMethod}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Modal terjual</dt>
                <dd className="font-mono">{formatMoney(order.costTotal, settings.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Laba kotor</dt>
                <dd className="font-mono">
                  {formatMoney(order.total - order.taxAmount - order.costTotal, settings.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Poin didapat</dt>
                <dd className="font-mono">
                  {order.pointsEarned}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="font-mono tabular">{value}</dd>
    </div>
  );
}