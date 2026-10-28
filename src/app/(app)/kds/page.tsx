import type { Metadata } from "next";
import { and, asc, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { orderItems, orders } from "@/lib/db/schema";
import { requireStore } from "@/lib/auth";
import { dayStart } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { KdsBoard, type KdsOrder } from "@/components/kds/kds-board";

export const metadata: Metadata = { title: "Dapur" };

export default async function KdsPage() {
  const { store } = await requireStore();
  const today = new Date(dayStart(new Date()));

  const rows = await db
    .select({
      id: orders.id,
      number: orders.number,
      orderType: orders.orderType,
      tableLabel: orders.tableLabel,
      status: orders.status,
      kitchenStatus: orders.kitchenStatus,
      createdAt: orders.createdAt,
      note: orders.note,
    })
    .from(orders)
    .where(
      and(
        eq(orders.storeId, store.id),
        gte(orders.createdAt, today),
        ne(orders.status, "refunded"),
        ne(orders.status, "merged"),
        ne(orders.kitchenStatus, "served"),
      ),
    )
    .orderBy(asc(orders.createdAt))
    .limit(40);

  const items = rows.length
    ? await db
        .select({
          orderId: orderItems.orderId,
          name: orderItems.name,
          qty: orderItems.qty,
          note: orderItems.note,
        })
        .from(orderItems)
        .where(
          inArray(
            orderItems.orderId,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(asc(orderItems.id))
    : [];

  const itemsByOrder = new Map<number, { name: string; qty: number; note: string | null }[]>();
  for (const item of items) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push({ name: item.name, qty: item.qty, note: item.note });
    itemsByOrder.set(item.orderId, list);
  }

  const queue: KdsOrder[] = rows.map((row) => ({
    id: row.id,
    number: row.number,
    orderType: row.orderType,
    tableLabel: row.tableLabel,
    status: row.status,
    kitchenStatus: row.kitchenStatus,
    createdAt: row.createdAt.toISOString(),
    note: row.note,
    items: itemsByOrder.get(row.id) ?? [],
  }));

  const ready = queue.filter((order) => order.kitchenStatus === "ready").length;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        eyebrow={`${store.name} · layar dapur`}
        title="Dapur"
        description={`Antrian pesanan hari ini. ${queue.length} menunggu · ${ready} siap diangkat. Penyegaran otomatis tiap 10 detik.`}
      />
      <KdsBoard orders={queue} />
    </div>
  );
}
