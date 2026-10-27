import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, orderItems, orders, users } from "@/lib/db/schema";
import { getStoreContext } from "@/lib/auth";
import { readDateRange } from "@/lib/dates";
import { toCsv } from "@/lib/csv";

export async function GET(request: Request) {
  const context = await getStoreContext();
  if (!context) return new Response("Unauthorized", { status: 401 });
  if (context.user.role !== "admin") return new Response("Forbidden", { status: 403 });
  if (!context.store) return new Response("Pilih toko dulu", { status: 400 });
  const storeId = context.store.id;

  const url = new URL(request.url);
  const range = readDateRange({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  const start = new Date(`${range.from}T00:00:00+07:00`);
  const end = new Date(`${range.to}T00:00:00+07:00`);
  end.setDate(end.getDate() + 1);

  const rows = await db
    .select({
      number: orders.number,
      createdAt: orders.createdAt,
      cashier: users.name,
      customer: customers.name,
      method: orders.paymentMethod,
      status: orders.status,
      subtotal: orders.subtotal,
      discount: orders.discountAmount,
      tax: orders.taxAmount,
      total: orders.total,
      cost: orders.costTotal,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(
      and(
        eq(orders.storeId, storeId),
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
      ),
    )
    .orderBy(asc(orders.createdAt));

  const items = await db
    .select({
      orderNumber: orders.number,
      name: orderItems.name,
      sku: orderItems.sku,
      qty: orderItems.qty,
      unitPrice: orderItems.unitPrice,
      lineTotal: orderItems.lineTotal,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.storeId, storeId),
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
      ),
    );

  const csv = [
    toCsv(
      ["nomor", "waktu", "kasir", "pelanggan", "metode", "status", "subtotal", "diskon", "pajak", "total", "modal"],
      rows.map((row) => [
        row.number,
        new Date(row.createdAt).toISOString(),
        row.cashier,
        row.customer ?? "",
        row.method,
        row.status,
        row.subtotal / 100,
        row.discount / 100,
        row.tax / 100,
        row.total / 100,
        row.cost / 100,
      ]),
    ),
    "",
    toCsv(
      ["nomor", "produk", "sku", "qty", "harga", "jumlah"],
      items.map((item) => [
        item.orderNumber,
        item.name,
        item.sku,
        item.qty,
        item.unitPrice / 100,
        item.lineTotal / 100,
      ]),
    ),
  ].join("\n");

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="laporan-${context.store.code}-${range.from}-${range.to}.csv"`,
    },
  });
}