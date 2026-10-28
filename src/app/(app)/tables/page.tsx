import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Clock, UtensilsCrossed } from "lucide-react";
import { db } from "@/lib/db";
import { customers, orderItems, orders, storeTables } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatTime } from "@/lib/money";
import { PageHeader, SectionLabel } from "@/components/shared/page-header";
import { TableDialog } from "@/components/tables/table-dialog";
import { SettleDialog } from "@/components/tables/settle-dialog";
import { MoveTableDialog, MergeOrdersDialog } from "@/components/tables/table-actions";
import { TableQr } from "@/components/tables/table-qr";

export const metadata: Metadata = { title: "Meja" };

export default async function TablesPage() {
  const { user, store } = await requireAdmin();
  const settings = await getSettings(store.id);

  const [tableRows, openOrders, customerList] = await Promise.all([
    db
      .select()
      .from(storeTables)
      .where(eq(storeTables.storeId, store.id))
      .orderBy(asc(storeTables.name)),
    db
      .select()
      .from(orders)
      .where(and(eq(orders.storeId, store.id), eq(orders.status, "open")))
      .orderBy(asc(orders.createdAt)),
    db
      .select({ id: customers.id, name: customers.name, points: customers.points })
      .from(customers)
      .where(eq(customers.storeId, store.id))
      .orderBy(asc(customers.name)),
  ]);

  const items = openOrders.length
    ? await db
        .select({
          orderId: orderItems.orderId,
          name: orderItems.name,
          qty: orderItems.qty,
          note: orderItems.note,
          lineTotal: orderItems.lineTotal,
        })
        .from(orderItems)
        .where(
          inArray(
            orderItems.orderId,
            openOrders.map((order) => order.id),
          ),
        )
        .orderBy(asc(orderItems.id))
    : [];

  const itemsByOrder = new Map<number, typeof items>();
  for (const item of items) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }

  const openByTable = new Map<number, number>();
  for (const order of openOrders) {
    if (order.tableId) openByTable.set(order.tableId, (openByTable.get(order.tableId) ?? 0) + 1);
  }
  const openTotal = openOrders.reduce((sum, order) => sum + order.total, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={`Ruangan · ${store.name}`}
        title="Meja"
        description="Tagihan meja (bayar nanti), pindah/gabung pesanan, dan QR self-order per meja."
        actions={<TableDialog />}
      />

      <section className="grid gap-px border border-border bg-border sm:grid-cols-3">
        <Stat label="Meja aktif" value={String(tableRows.filter((t) => t.active).length)} />
        <Stat label="Tagihan terbuka" value={String(openOrders.length)} />
        <Stat label="Nilai tagihan" value={formatMoney(openTotal, settings.currency)} />
      </section>

      <section className="border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <SectionLabel>Belum dibayar</SectionLabel>
          <h2 className="font-serif text-2xl leading-none">Tagihan meja</h2>
        </div>
        {openOrders.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            Tidak ada tagihan terbuka. Buka dari kasir dengan tombol{" "}
            <span className="text-foreground">“Tagih nanti (meja)”</span> saat melayani
            dine-in, atau lewat QR self-order pelanggan.
          </div>
        ) : (
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {openOrders.map((order) => (
              <article key={order.id} className="flex flex-col border border-border">
                <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div>
                    <p className="font-mono text-sm">{order.number}</p>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="size-3" />
                      {formatTime(order.createdAt)} ·{" "}
                      {order.tableLabel ? `Meja ${order.tableLabel}` : "tanpa meja"}
                      {order.userId === null ? " · self-order" : ""}
                    </p>
                  </div>
                  <span className="font-mono text-lg tabular">
                    {formatMoney(order.total, settings.currency)}
                  </span>
                </header>
                <ul className="flex-1 divide-y divide-dashed divide-border/70">
                  {(itemsByOrder.get(order.id) ?? []).map((item, index) => (
                    <li key={index} className="flex justify-between gap-2 px-4 py-2 text-sm">
                      <span className="min-w-0">
                        {item.qty}× {item.name}
                        {item.note ? (
                          <span className="block text-[11px] text-signal">{item.note}</span>
                        ) : null}
                      </span>
                      <span className="font-mono text-xs tabular">
                        {formatMoney(item.lineTotal, settings.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
                <footer className="flex flex-wrap gap-1.5 border-t border-border p-3">
                  <SettleDialog
                    bill={{
                      orderId: order.id,
                      number: order.number,
                      tableLabel: order.tableLabel,
                      total: order.total,
                    }}
                    currency={settings.currency}
                    customers={customerList}
                  />
                  <MoveTableDialog
                    orderId={order.id}
                    number={order.number}
                    tables={tableRows
                      .filter((table) => table.active)
                      .map((table) => ({ id: table.id, name: table.name }))}
                    currency={settings.currency}
                  />
                  <MergeOrdersDialog
                    sourceId={order.id}
                    number={order.number}
                    total={order.total}
                    others={openOrders
                      .filter((other) => other.id !== order.id)
                      .map((other) => ({
                        id: other.id,
                        number: other.number,
                        tableLabel: other.tableLabel,
                        total: other.total,
                      }))}
                    currency={settings.currency}
                  />
                  <Link
                    href={`/kds`}
                    className="grid h-8 place-items-center border border-border px-2 text-[11px] text-muted-foreground hover:border-foreground hover:text-foreground"
                  >
                    <UtensilsCrossed className="size-3.5" />
                  </Link>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <SectionLabel>Denah & self-order</SectionLabel>
          <h2 className="font-serif text-2xl leading-none">Daftar meja</h2>
        </div>
        {tableRows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            Belum ada meja. Tambahkan meja supaya kasir bisa membuka tagihan dan
            pelanggan bisa memesan lewat QR.
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {tableRows.map((table) => {
              const open = openByTable.get(table.id) ?? 0;
              return (
                <div
                  key={table.id}
                  className={`flex items-center gap-3 border px-4 py-3 ${
                    !table.active
                      ? "border-border/50 opacity-60"
                      : open > 0
                        ? "border-signal/50"
                        : "border-border"
                  }`}
                >
                  <TableQr storeCode={store.code} tableId={table.id} tableName={table.name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{table.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {table.seats} kursi ·{" "}
                      {open > 0 ? (
                        <span className="text-signal">
                          {open} tagihan{open > 1 ? " (rombongan)" : ""}
                        </span>
                      ) : (
                        "kosong"
                      )}
                    </p>
                    <div className="mt-1.5">
                      <TableDialog
                        table={{ id: table.id, name: table.name, seats: table.seats, active: table.active }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
