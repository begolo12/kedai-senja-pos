"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  customers,
  orderItems,
  orderPayments,
  orders,
  products,
  shifts,
  storeTables,
} from "@/lib/db/schema";
import { assertAdmin, assertStore, type ActionResult } from "@/lib/auth";
import { orderNumber } from "@/lib/money";
import { dayStart } from "@/lib/dates";
import { deductForSale } from "@/lib/recipes";
import { pointsWithMultiplier, resolveTier } from "@/lib/tiers";
import { tableSchema } from "@/lib/validation";
import { getSettings } from "@/lib/settings";

export async function saveTableAction(input: unknown): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  const { store } = auth;

  const parsed = tableSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const data = parsed.data;

  const clash = await db
    .select({ id: storeTables.id })
    .from(storeTables)
    .where(and(eq(storeTables.storeId, store.id), eq(storeTables.name, data.name)))
    .limit(1);
  if (clash[0] && clash[0].id !== data.id) {
    return { ok: false, error: `Meja ${data.name} sudah ada.` };
  }

  if (data.id) {
    const found = await db
      .select({ id: storeTables.id })
      .from(storeTables)
      .where(and(eq(storeTables.id, data.id), eq(storeTables.storeId, store.id)))
      .limit(1);
    if (!found[0]) return { ok: false, error: "Meja tidak ditemukan." };
    await db
      .update(storeTables)
      .set({ name: data.name, seats: data.seats, active: data.active })
      .where(and(eq(storeTables.id, data.id), eq(storeTables.storeId, store.id)));
  } else {
    await db.insert(storeTables).values({
      storeId: store.id,
      name: data.name,
      seats: data.seats,
      active: data.active,
    });
  }

  revalidatePath("/tables");
  revalidatePath("/pos");
  return { ok: true };
}

export async function toggleTableAction(id: number): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  const { store } = auth;
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Meja tidak valid." };
  }

  const found = await db
    .select({ active: storeTables.active })
    .from(storeTables)
    .where(and(eq(storeTables.id, id), eq(storeTables.storeId, store.id)))
    .limit(1);
  const current = found[0];
  if (!current) return { ok: false, error: "Meja tidak ditemukan." };

  await db
    .update(storeTables)
    .set({ active: !current.active })
    .where(and(eq(storeTables.id, id), eq(storeTables.storeId, store.id)));

  revalidatePath("/tables");
  return { ok: true };
}

export type OpenOrderResult =
  | { ok: true; orderId: number; number: string; total: number }
  | { ok: false; error: string };

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

  const lines = rows.map(({ product, qty, note }) => ({
    product: product!,
    qty,
    note,
    lineTotal: product!.price * qty,
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
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
      total: subtotal,
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
      unitPrice: line.product.price,
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
  if (!deducted.ok) return { ok: false as const, error: deducted.error };

  return { ok: true, orderId: order.id, number: order.number, total: subtotal };
}

/** Kasir membuka tagihan meja dari keranjang: bayar nanti di halaman Meja. */
export async function createOpenOrderAction(input: unknown): Promise<OpenOrderResult> {
  const auth = await assertStore();
  if (!auth.ok) return auth;
  const { user, store } = auth;

  const data = input as {
    clientId?: unknown;
    tableId?: unknown;
    tableLabel?: unknown;
    note?: unknown;
    items?: unknown;
  };
  if (typeof data.clientId !== "string" || !/^[0-9a-f-]{36}$/i.test(data.clientId)) {
    return { ok: false, error: "ID tagihan tidak valid." };
  }

  const shift = (
    await db
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        and(
          eq(shifts.userId, user.id),
          eq(shifts.storeId, store.id),
          eq(shifts.status, "open"),
        ),
      )
      .limit(1)
  )[0];
  if (!shift) return { ok: false, error: "Buka shift dulu sebelum transaksi." };

  const result = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.clientId, data.clientId as string))
      .limit(1);
    if (existing[0]) {
      return { ok: true as const, orderId: existing[0].id, number: "", total: 0 };
    }
    return createOpenOrderInTx(tx, {
      storeId: store.id,
      userId: user.id,
      shiftId: shift.id,
      clientId: data.clientId as string,
      tableId: typeof data.tableId === "number" ? data.tableId : null,
      tableLabel: typeof data.tableLabel === "string" ? data.tableLabel.slice(0, 40) : null,
      note: typeof data.note === "string" ? data.note.slice(0, 200) : null,
      items: data.items as { productId: number; qty: number; note?: string }[],
    });
  });

  revalidatePath("/tables");
  revalidatePath("/kds");
  return result;
}

export type SettleResult =
  | { ok: true; orderId: number; changeDue: number }
  | { ok: false; error: string };

/** Tutup tagihan meja: validasi pembayaran, poin, dan status selesai. */
export async function settleOrderAction(
  orderId: number,
  payments: { method: "cash" | "card" | "qris"; amount: number }[],
  customerId: number | null,
): Promise<SettleResult> {
  const auth = await assertStore();
  if (!auth.ok) return auth;
  const { user, store } = auth;
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "Pesanan tidak valid." };
  }
  const list = (payments ?? []).filter((p) => p && p.amount > 0);
  if (list.length === 0 || list.length > 4) {
    return { ok: false, error: "Pembayaran tidak valid." };
  }
  for (const payment of list) {
    if (
      !["cash", "card", "qris"].includes(payment.method) ||
      !Number.isInteger(payment.amount) ||
      payment.amount < 0
    ) {
      return { ok: false, error: "Pembayaran tidak valid." };
    }
  }

  const result = await db.transaction(async (tx) => {
    const found = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.storeId, store.id)))
      .for("update");
    const order = found[0];
    if (!order) return { ok: false as const, error: "Pesanan tidak ditemukan." };
    if (order.status !== "open") {
      return { ok: false as const, error: "Tagihan ini sudah diselesaikan." };
    }

    const settings = await getSettings(store.id);
    const cashTotal = list
      .filter((p) => p.method === "cash")
      .reduce((sum, p) => sum + p.amount, 0);
    const nonCashTotal = list
      .filter((p) => p.method !== "cash")
      .reduce((sum, p) => sum + p.amount, 0);
    if (nonCashTotal > order.total) {
      return { ok: false as const, error: "Total pembayaran melebihi tagihan." };
    }
    if (cashTotal < order.total - nonCashTotal) {
      return { ok: false as const, error: "Uang diterima kurang dari tagihan." };
    }
    const changeDue = cashTotal - (order.total - nonCashTotal);
    const paymentMethod = list.length > 1 ? "mixed" : list[0].method;

    const shift = (
      await tx
        .select({ id: shifts.id })
        .from(shifts)
        .where(
          and(
            eq(shifts.userId, user.id),
            eq(shifts.storeId, store.id),
            eq(shifts.status, "open"),
          ),
        )
        .limit(1)
    )[0];

    let pointsEarned = 0;
    if (customerId) {
      const customer = await tx
        .select({ points: customers.points, totalSpent: customers.totalSpent })
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.storeId, store.id)))
        .limit(1);
      if (customer[0]) {
        const multiplier =
          (await resolveTier(store.id, customer[0].totalSpent))?.pointsMultiplier ?? 100;
        pointsEarned = settings.pointsPerAmount
          ? pointsWithMultiplier(Math.floor(order.total / settings.pointsPerAmount), multiplier)
          : 0;
        await tx
          .update(customers)
          .set({
            points: sql`${customers.points} + ${pointsEarned}`,
            totalSpent: sql`${customers.totalSpent} + ${order.total}`,
          })
          .where(eq(customers.id, customerId));
        await tx.update(orders).set({ customerId }).where(eq(orders.id, orderId));
      }
    }

    await tx
      .update(orders)
      .set({
        status: "completed",
        settledAt: new Date(),
        shiftId: shift?.id ?? order.shiftId,
        paymentMethod,
        amountPaid: cashTotal + nonCashTotal,
        changeDue,
        pointsEarned,
      })
      .where(eq(orders.id, orderId));

    await tx.insert(orderPayments).values(
      list.map((p) => ({
        orderId,
        method: p.method,
        amount: p.method === "cash" ? order.total - nonCashTotal : p.amount,
      })),
    );

    return { ok: true as const, orderId, changeDue };
  });

  if (result.ok) {
    revalidatePath("/tables");
    revalidatePath("/orders");
    revalidatePath("/reports");
  }
  return result;
}

export async function moveOrderTableAction(
  orderId: number,
  tableId: number,
): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  const { store } = auth;

  const result = await db.transaction(async (tx) => {
    const found = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.storeId, store.id)))
      .limit(1);
    if (!found[0]) return { ok: false as const, error: "Pesanan tidak ditemukan." };
    const order = (await tx.select().from(orders).where(eq(orders.id, orderId)))[0]!;
    if (order.status !== "open") {
      return { ok: false as const, error: "Hanya tagihan terbuka yang bisa dipindah." };
    }
    const table = await tx
      .select({ name: storeTables.name })
      .from(storeTables)
      .where(and(eq(storeTables.id, tableId), eq(storeTables.storeId, store.id)))
      .limit(1);
    if (!table[0]) return { ok: false as const, error: "Meja tujuan tidak ditemukan." };
    await tx
      .update(orders)
      .set({ tableId, tableLabel: table[0].name })
      .where(eq(orders.id, orderId));
    return { ok: true as const };
  });

  revalidatePath("/tables");
  return result;
}

export async function mergeOrdersAction(
  sourceId: number,
  targetId: number,
): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  const { store } = auth;
  if (sourceId === targetId) {
    return { ok: false, error: "Tidak bisa menggabungkan tagihan ke dirinya sendiri." };
  }

  const result = await db.transaction(async (tx) => {
    const found = await tx
      .select()
      .from(orders)
      .where(
        and(
          inArray(orders.id, [sourceId, targetId]),
          eq(orders.storeId, store.id),
          eq(orders.status, "open"),
        ),
      )
      .for("update");
    const source = found.find((order) => order.id === sourceId);
    const target = found.find((order) => order.id === targetId);
    if (!source || !target) {
      return { ok: false as const, error: "Kedua tagihan harus masih terbuka." };
    }

    await tx
      .update(orderItems)
      .set({ orderId: targetId })
      .where(eq(orderItems.orderId, sourceId));

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, targetId));
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const costTotal = items.reduce((sum, item) => sum + item.cost * item.qty, 0);
    const settings = await getSettings(store.id);
    const discountAmount =
      target.discountType === "percent"
        ? Math.round((subtotal * Math.min(100, Math.max(0, target.discountValue))) / 100)
        : target.discountType === "amount"
          ? Math.min(subtotal, Math.max(0, target.discountValue))
          : 0;
    const taxAmount = Math.round(((subtotal - discountAmount) * settings.taxRate) / 10000);

    await tx
      .update(orders)
      .set({
        subtotal,
        discountAmount,
        taxAmount,
        total: subtotal - discountAmount + taxAmount,
        costTotal,
      })
      .where(eq(orders.id, targetId));

    await tx
      .update(orders)
      .set({
        status: "merged",
        note: `Digabung ke ${target.number}`,
      })
      .where(eq(orders.id, sourceId));

    return { ok: true as const };
  });

  revalidatePath("/tables");
  revalidatePath("/kds");
  return result;
}
