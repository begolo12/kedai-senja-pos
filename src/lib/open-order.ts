import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { orderItems, orders, products, storeTables } from "./db/schema";
import { orderNumber, computeTotals } from "./money";
import { computeModifierDelta } from "./modifiers";
import { dayStart } from "./dates";
import { deductForSale } from "./recipes";

// Helper transaksi bersama untuk aksi kasir (actions/tables) dan API
// self-order publik (api/public/order). Sengaja BUKAN file "use server"
// agar fungsi ini tidak terdaftar sebagai server action yang bisa dipanggil
// klien — autorisasi adalah tugas pemanggilnya.

export type OpenOrderResult =
  | { ok: true; orderId: number; number: string; total: number }
  | { ok: false; error: string };

export class OpenOrderAbortError extends Error {}

const tabItemSchema = {
  productId: (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) && value > 0,
  qty: (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 999,
};

/** Validasi + potong stok + simpan pesanan terbuka (tagihan meja). */
export async function createOpenOrderInTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    storeId: number;
    userId: number | null;
    shiftId: number | null;
    clientId: string;
    tableId: number | null;
    tableLabel: string | null;
    note: string | null;
    items: { productId: number; qty: number; note?: string }[];
    serviceChargeRate?: number;
    taxRate: number;
  },
): Promise<OpenOrderResult> {
  const items = input.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    return { ok: false, error: "Item tagihan tidak valid." };
  }
  for (const item of items) {
    if (!tabItemSchema.productId(item.productId) || !tabItemSchema.qty(item.qty)) {
      return { ok: false, error: "Item tagihan tidak valid." };
    }
    if (item.note !== undefined && typeof item.note !== "string") {
      return { ok: false, error: "Catatan item tidak valid." };
    }
  }

  const merged = new Map<string, { productId: number; qty: number; note: string }>();
  for (const item of items) {
    const note = (item.note ?? "").trim().slice(0, 160);
    const key = `${item.productId}::${note}`;
    const existing = merged.get(key);
    merged.set(key, {
      productId: item.productId,
      qty: (existing?.qty ?? 0) + item.qty,
      note,
    });
  }

  let tableLabel = input.tableLabel;
  if (input.tableId) {
    const table = await tx
      .select({ name: storeTables.name })
      .from(storeTables)
      .where(and(eq(storeTables.id, input.tableId), eq(storeTables.storeId, input.storeId)))
      .limit(1);
    if (!table[0]) return { ok: false, error: "Meja tidak ditemukan." };
    tableLabel = table[0].name;
  }

  const rows = [];
  for (const { productId, qty, note } of merged.values()) {
    const found = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, productId), eq(products.storeId, input.storeId)))
      .for("update");
    rows.push({ product: found[0], qty, note });
  }

  for (const row of rows) {
    if (!row.product) return { ok: false as const, error: "Produk tidak ditemukan." };
    if (!row.product.active) {
      return { ok: false as const, error: `${row.product.name} sedang tidak dijual.` };
    }
  }

  const lines = rows.map(({ product, qty, note }) => {
    const unitPrice = product!.price + computeModifierDelta(product!.options, note);
    return {
      product: product!,
      qty,
      note,
      unitPrice,
      lineTotal: unitPrice * qty,
    };
  });
  const totals = computeTotals(
    lines.map((line) => ({ unitPrice: line.unitPrice, qty: line.qty })),
    {
      serviceChargeRate: input.serviceChargeRate ?? 0,
      taxRate: input.taxRate,
    },
  );
  const { subtotal, serviceChargeAmount, taxAmount, total } = totals;
  const createdAt = new Date();

  await tx.execute(sql`select pg_advisory_xact_lock(771122)`);
  const countToday = (
    await tx
      .select({ n: sql<string>`count(*)` })
      .from(orders)
      .where(
        and(
          eq(orders.storeId, input.storeId),
          sql`${orders.createdAt} >= ${new Date(dayStart(createdAt))}`,
        ),
      )
  )[0]?.n;

  const [order] = await tx
    .insert(orders)
    .values({
      number: orderNumber(createdAt, Number(countToday ?? 0) + 1),
      clientId: input.clientId,
      storeId: input.storeId,
      shiftId: input.shiftId,
      userId: input.userId,
      tableId: input.tableId,
      subtotal,
      serviceChargeAmount,
      taxAmount,
      total,
      costTotal: lines.reduce((sum, line) => sum + line.product.cost * line.qty, 0),
      orderType: "dine_in",
      tableLabel,
      status: "open",
      note: input.note,
      createdAt,
    })
    .returning({ id: orders.id, number: orders.number });

  await tx.insert(orderItems).values(
    lines.map((line) => ({
      orderId: order.id,
      productId: line.product.id,
      name: line.product.name,
      sku: line.product.sku,
      unitPrice: line.unitPrice,
      cost: line.product.cost,
      qty: line.qty,
      note: line.note || null,
      lineTotal: line.lineTotal,
    })),
  );

  // Potong stok (produk berresep memotong bahan, bukan dirinya sendiri).
  const deducted = await deductForSale(tx, {
    storeId: input.storeId,
    userId: input.userId,
    orderId: order.id,
    lines: lines.map((line) => ({ product: line.product, qty: line.qty })),
    createdAt,
  });
  if (!deducted.ok) throw new OpenOrderAbortError(deducted.error);

  return { ok: true, orderId: order.id, number: order.number, total };
}
