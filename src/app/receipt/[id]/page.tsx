import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, RotateCcw } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, orderItems, orders, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatDateTime, formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/receipt/print-button";

export default async function ReceiptPage({ params, searchParams }: PageProps<"/receipt/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { fresh } = await searchParams;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();

  const order = (await db
    .select({
      order: orders,
      cashier: users.name,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(eq(orders.id, orderId))
    )[0];
  if (!order) notFound();
  if (user.role !== "admin" && order.order.userId !== user.id) notFound();

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const settings = await getSettings();
  const isFresh = fresh === "1";
  const cashier = order.cashier;
  const paper = settings.receiptWidth === "58" ? "58" : "80";
  const sheetWidth = paper === "58" ? 300 : 340;

  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center bg-background px-4 py-8 print:block print:bg-white print:p-0">
      <style>{`@media print { @page { size: ${paper}mm auto; margin: 3mm; } .receipt-sheet { width: ${paper}mm !important; max-width: none !important; } }`}</style>
      <div className="no-print mb-4 flex w-full max-w-md items-center justify-between gap-2 print:hidden">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/pos" />}>
          <ArrowLeft /> Kasir
        </Button>
        <div className="flex gap-2">
          <PrintButton />
          {user.role === "admin" ? (
            <Button nativeButton={false} size="sm" render={<Link href={`/orders/${orderId}`} />}>
              Detail
            </Button>
          ) : null}
        </div>
      </div>

      {isFresh ? (
        <div className="no-print mb-4 w-full max-w-md border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            <span className="grid size-4 place-items-center bg-signal text-signal-foreground">
              <Check className="size-3" />
            </span>
            Pembayaran diterima
          </p>
          <div className="mt-3 flex items-end justify-between">
            <span className="text-sm text-muted-foreground">Kembalian</span>
            <span className="font-mono text-3xl tracking-tight tabular">
              {formatMoney(order.order.changeDue, settings.currency)}
            </span>
          </div>
        </div>
      ) : null}

      <article
        className="receipt-sheet w-full border border-border bg-[#fffdf8] px-6 py-7 text-[#1e1b16] shadow-[4px_4px_0_0_var(--border)] print:border-0 print:shadow-none"
        style={{ maxWidth: sheetWidth }}
      >
        <header className="text-center">
          <h1 className="font-serif text-2xl tracking-tight">{settings.storeName}</h1>
          <p className="mt-1 text-[10px] leading-relaxed text-[#6b6257]">
            {settings.address}
          </p>
          <p className="text-[10px] text-[#6b6257]">{settings.phone}</p>
        </header>

        <div className="my-4 border-t border-dashed border-[#c9c0b1]" />

        <div className="space-y-0.5 font-mono text-[10px] text-[#4b443b]">
          <div className="flex justify-between">
            <span>No. {order.order.number}</span>
            <span>{formatDateTime(order.order.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span>Kasir {cashier}</span>
            <span>{order.order.paymentMethod.toUpperCase()}</span>
          </div>
          <div className="flex justify-between">
            <span>{order.order.orderType === "takeaway" ? "Bungkus" : "Dine-in"}</span>
            <span>{order.order.tableLabel ?? "—"}</span>
          </div>
          {order.customerName ? (
            <div className="flex justify-between">
              <span>Pelanggan</span>
              <span>{order.customerName}</span>
            </div>
          ) : null}
        </div>

        <div className="my-4 border-t border-dashed border-[#c9c0b1]" />

        <table className="w-full font-mono text-[11px]">
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="align-top">
                <td className="pb-2.5">
                  <span className="block">{item.name}</span>
                  {item.note ? (
                    <span className="block text-[10px] text-[#8a5a1e]">{item.note}</span>
                  ) : null}
                  <span className="text-[10px] text-[#6b6257]">
                    {item.qty} × {formatMoney(item.unitPrice, settings.currency)}
                  </span>
                </td>
                <td className="pb-2.5 text-right tabular">
                  {formatMoney(item.lineTotal, settings.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-dashed border-[#c9c0b1] pt-3 font-mono text-[11px]">
          <Line label="Subtotal" value={formatMoney(order.order.subtotal, settings.currency)} />
          {order.order.discountAmount > 0 ? (
            <Line
              label="Diskon"
              value={`−${formatMoney(order.order.discountAmount, settings.currency)}`}
            />
          ) : null}
          <Line
            label={`Pajak ${(settings.taxRate / 100).toLocaleString("id-ID")}%`}
            value={formatMoney(order.order.taxAmount, settings.currency)}
          />
          <div className="mt-2 flex justify-between border-t border-[#1e1b16] pt-2 text-[13px] font-semibold">
            <span>Total</span>
            <span className="tabular">{formatMoney(order.order.total, settings.currency)}</span>
          </div>
          <Line label="Dibayar" value={formatMoney(order.order.amountPaid, settings.currency)} />
          <Line label="Kembali" value={formatMoney(order.order.changeDue, settings.currency)} />
        </div>

        {order.customerName ? (
          <p className="mt-3 border-t border-dashed border-[#c9c0b1] pt-2 text-center font-mono text-[10px] text-[#6b6257]">
            Poin pelanggan otomatis ditambahkan.
          </p>
        ) : null}

        <div className="my-4 border-t border-dashed border-[#c9c0b1]" />

        <footer className="text-center font-mono text-[10px] leading-relaxed text-[#6b6257]">
          <p>{settings.receiptFooter}</p>
          <p className="mt-2 tracking-[0.24em] uppercase">Terima kasih</p>
        </footer>

        {order.order.status === "refunded" ? (
          <div className="mt-4 flex items-center justify-center gap-1 border border-[#a33a22] py-1 text-[10px] tracking-[0.18em] text-[#a33a22] uppercase">
            <RotateCcw className="size-3" /> Dikembalikan
          </div>
        ) : null}
      </article>

      <p className="no-print mt-4 max-w-[340px] text-center text-[11px] text-muted-foreground">
        Struk ini juga tersimpan permanen di halaman Pesanan.
      </p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5 text-[#4b443b]">
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}