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
import { assertAdmin, assertCashierOrAdmin, type ActionResult } from "@/lib/auth";
import { createOpenOrderInTx, type OpenOrderResult } from "@/lib/open-order";
import { computeTotals } from "@/lib/money";
import { computeModifierDelta } from "@/lib/modifiers";
import { deductForSale, restoreForRefund } from "@/lib/recipes";
import { pointsWithMultiplier, resolveTier } from "@/lib/tiers";
import { tableSchema } from "@/lib/validation";

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

/** Kasir membuka tagihan meja dari keranjang: bayar nanti di halaman Meja. */
export async function createOpenOrderAction(input: unknown): Promise<OpenOrderResult> {
  const auth = await assertCashierOrAdmin();
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
      serviceChargeRate: store.serviceChargeRate,
      taxRate: store.taxRate,
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
  const auth = await assertCashierOrAdmin();
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

    const cashList = list.filter((p) => p.method === "cash");
    if (cashList.length > 1) {
      return { ok: false as const, error: "Metode tunai hanya boleh satu baris." };
    }
    const cashTotal = cashList.reduce((sum, p) => sum + p.amount, 0);
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

    // Tunai harus masuk ke shift terbuka, sama seperti aturan kasir POS —
    // kalau tidak, uang laci tidak pernah muncul di rekonsiliasi shift.
    if (cashTotal > 0 && !shift) {
      return {
        ok: false as const,
        error: "Buka shift dulu untuk menerima pembayaran tunai.",
      };
    }

    let pointsEarned = 0;
    if (customerId) {
      const customer = await tx
        .select({ points: customers.points, totalSpent: customers.totalSpent })
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.storeId, store.id)))
        .limit(1);
      if (customer[0]) {
        const multiplier =
          (await resolveTier(store.id, customer[0].totalSpent, tx))?.pointsMultiplier ?? 100;
        pointsEarned = store.pointsPerAmount
          ? pointsWithMultiplier(Math.floor(order.total / store.pointsPerAmount), multiplier)
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
        userId: order.userId ?? user.id,
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
    const totals = computeTotals(
      items.map((item) => ({ unitPrice: item.unitPrice, qty: item.qty })),
      {
        discountType: target.discountType,
        discountValue: target.discountValue,
        serviceChargeRate: store.serviceChargeRate,
        taxRate: store.taxRate,
      },
    );
    const costTotal = items.reduce((sum, item) => sum + item.cost * item.qty, 0);

    await tx
      .update(orders)
      .set({
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        serviceChargeAmount: totals.serviceChargeAmount,
        taxAmount: totals.taxAmount,
        total: totals.total,
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

/** Tambah item susulan ke tagihan meja yang masih terbuka. */
export async function addItemsToOpenOrderAction(
  orderId: number,
  items: { productId: number; qty: number; note?: string }[],
): Promise<ActionResult> {
  const auth = await assertCashierOrAdmin();
  if (!auth.ok) return auth;
  const { user, store } = auth;
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "Tagihan tidak valid." };
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return { ok: false, error: "Pilih minimal satu item." };
  }
  for (const item of items) {
    if (
      !Number.isInteger(item.productId) ||
      item.productId <= 0 ||
      !Number.isInteger(item.qty) ||
      item.qty <= 0 ||
      item.qty > 999
    ) {
      return { ok: false, error: "Item tambahan tidak valid." };
    }
  }

  const result = await db.transaction(async (tx) => {
    const found = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.storeId, store.id)))
      .for("update");
    const order = found[0];
    if (!order) return { ok: false as const, error: "Tagihan tidak ditemukan." };
    if (order.status !== "open") {
      return { ok: false as const, error: "Hanya tagihan terbuka yang bisa ditambah item." };
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

    const rows = [];
    for (const { productId, qty, note } of merged.values()) {
      const p = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, productId), eq(products.storeId, store.id)))
        .for("update");
      if (!p[0]) return { ok: false as const, error: "Produk tidak ditemukan." };
      if (!p[0].active) return { ok: false as const, error: `${p[0].name} sedang tidak dijual.` };
      rows.push({ product: p[0], qty, note });
    }

    const lines = rows.map(({ product, qty, note }) => {
      const unitPrice = product.price + computeModifierDelta(product.options, note);
      return { product, qty, note, unitPrice, lineTotal: unitPrice * qty };
    });

    const deducted = await deductForSale(tx, {
      storeId: store.id,
      userId: user.id,
      orderId: order.id,
      lines: lines.map((line) => ({ product: line.product, qty: line.qty })),
      createdAt: new Date(),
    });
    if (!deducted.ok) return { ok: false as const, error: deducted.error };

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

    const allItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const totals = computeTotals(
      allItems.map((item) => ({ unitPrice: item.unitPrice, qty: item.qty })),
      {
        discountType: order.discountType,
        discountValue: order.discountValue,
        serviceChargeRate: store.serviceChargeRate,
        taxRate: store.taxRate,
      },
    );
    const costTotal = allItems.reduce((sum, item) => sum + item.cost * item.qty, 0);

    await tx
      .update(orders)
      .set({
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        serviceChargeAmount: totals.serviceChargeAmount,
        taxAmount: totals.taxAmount,
        total: totals.total,
        costTotal,
        kitchenStatus: "preparing",
      })
      .where(eq(orders.id, order.id));

    return { ok: true as const };
  });

  if (result.ok) {
    revalidatePath("/tables");
    revalidatePath("/kds");
    revalidatePath("/orders");
    revalidatePath("/inventory");
  }
  return result;
}

/** Batalkan (void) tagihan meja terbuka dan kembalikan stok. */
export async function cancelOpenOrderAction(
  orderId: number,
  reason: string,
): Promise<ActionResult> {
  const auth = await assertCashierOrAdmin();
  if (!auth.ok) return auth;
  const { user, store } = auth;
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "Tagihan tidak valid." };
  }
  const cleanReason = reason.trim().slice(0, 160);
  if (cleanReason.length < 3) {
    return { ok: false, error: "Alasan pembatalan minimal 3 karakter." };
  }

  const result = await db.transaction(async (tx) => {
    const found = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.storeId, store.id)))
      .for("update");
    const order = found[0];
    if (!order) return { ok: false as const, error: "Tagihan tidak ditemukan." };
    if (order.status !== "open") {
      return { ok: false as const, error: "Hanya tagihan terbuka yang bisa dibatalkan." };
    }

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    await restoreForRefund(tx, {
      storeId: store.id,
      userId: user.id,
      orderId: order.id,
      items: items
        .filter((item) => item.qty > 0)
        .map((item) => ({ productId: item.productId, name: item.name, qty: item.qty })),
      reason: `Void tagihan ${order.number}: ${cleanReason}`,
      createdAt: new Date(),
    });

    await tx
      .update(orders)
      .set({
        status: "cancelled",
        kitchenStatus: "served",
        note: `Dibatalkan: ${cleanReason}`,
      })
      .where(eq(orders.id, order.id));

    return { ok: true as const };
  });

  if (result.ok) {
    revalidatePath("/tables");
    revalidatePath("/kds");
    revalidatePath("/orders");
    revalidatePath("/inventory");
  }
  return result;
}
