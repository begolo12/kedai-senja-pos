"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  customers,
  orderItems,
  orders,
  products,
  shifts,
  stockMovements,
} from "@/lib/db/schema";
import { assertAdmin, assertStore } from "@/lib/auth";
import { computeTotals, orderNumber } from "@/lib/money";
import { dayStart } from "@/lib/dates";
import { checkoutSchema } from "@/lib/validation";

export type CheckoutResult =
  | { ok: true; orderId: number; number: string; changeDue: number; total: number }
  | { ok: false; error: string };

export async function checkoutAction(input: unknown): Promise<CheckoutResult> {
  const auth = await assertStore();
  if (!auth.ok) return auth;
  const { user, store } = auth;

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const data = parsed.data;

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: orders.id,
        number: orders.number,
        storeId: orders.storeId,
        changeDue: orders.changeDue,
        total: orders.total,
      })
      .from(orders)
      .where(eq(orders.clientId, data.clientId))
      .limit(1);
    if (existing[0] && existing[0].storeId !== store.id) {
      return { ok: false as const, error: "ID pesanan sudah dipakai toko lain." };
    }
    if (existing[0]) {
      return { ok: true as const, orderId: existing[0].id, ...existing[0] };
    }

    const openShifts = await tx
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.userId, user.id),
          eq(shifts.storeId, store.id),
          eq(shifts.status, "open"),
        ),
      )
      .limit(1);
    const shift = openShifts[0];
    if (!shift) return { ok: false as const, error: "Buka shift dulu sebelum transaksi." };

    const merged = new Map<string, { productId: number; qty: number; note: string }>();
    for (const item of data.items) {
      const note = item.note?.trim() ?? "";
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
      const found = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, productId), eq(products.storeId, store.id)))
        .for("update");
      rows.push({ product: found[0], qty, note });
    }

    const requested = new Map<number, number>();
    for (const row of rows) {
      if (!row.product) return { ok: false as const, error: "Produk tidak ditemukan." };
      if (!row.product.active) {
        return { ok: false as const, error: `${row.product.name} sedang tidak dijual.` };
      }
      const total = (requested.get(row.product.id) ?? 0) + row.qty;
      requested.set(row.product.id, total);
      if (row.product.stock < total) {
        return {
          ok: false as const,
          error: `Stok ${row.product.name} tinggal ${row.product.stock}.`,
        };
      }
    }

    const lines = rows.map(({ product, qty, note }) => ({
      product: product!,
      qty,
      note,
      lineTotal: product!.price * qty,
    }));
    const taxRate = store.taxRate;
    const totals = computeTotals(
      lines.map((l) => ({ unitPrice: l.product.price, qty: l.qty })),
      { discountType: data.discountType, discountValue: data.discountValue, taxRate },
    );

    if (data.paymentMethod === "cash" && data.amountPaid < totals.total) {
      return { ok: false as const, error: "Uang diterima kurang dari total." };
    }
    const amountPaid = data.paymentMethod === "cash" ? data.amountPaid : totals.total;
    const changeDue = amountPaid - totals.total;
    const createdAt = new Date();

    let customerId: number | null = null;
    if (data.customerId) {
      const found = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.id, data.customerId),
            eq(customers.storeId, store.id),
          ),
        )
        .limit(1);
      customerId = found[0]?.id ?? null;
    }

    const pointsEarned =
      customerId && store.pointsPerAmount
        ? Math.floor(totals.total / store.pointsPerAmount)
        : 0;

    // Serialises the daily sequence; single-store scale makes this cheap and safe.
    await tx.execute(sql`select pg_advisory_xact_lock(771122)`);
    const countToday = (
      await tx
        .select({ n: sql<string>`count(*)` })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, store.id),
            sql`${orders.createdAt} >= ${new Date(dayStart(createdAt))}`,
          ),
        )
    )[0]?.n;

    const [order] = await tx
      .insert(orders)
      .values({
        number: orderNumber(createdAt, Number(countToday ?? 0) + 1),
        clientId: data.clientId,
        storeId: store.id,
        shiftId: shift.id,
        userId: user.id,
        customerId,
        subtotal: totals.subtotal,
        discountType: data.discountType,
        discountValue: data.discountValue,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        total: totals.total,
        costTotal: lines.reduce((s, l) => s + l.product.cost * l.qty, 0),
        pointsEarned,
        orderType: data.orderType,
        tableLabel: data.tableLabel || null,
        paymentMethod: data.paymentMethod,
        amountPaid,
        changeDue,
        note: data.note || null,
        createdAt,
      })
      .returning({ id: orders.id, number: orders.number });

    await tx.insert(orderItems).values(
      lines.map((l) => ({
        orderId: order.id,
        productId: l.product.id,
        name: l.product.name,
        sku: l.product.sku,
        unitPrice: l.product.price,
        cost: l.product.cost,
        qty: l.qty,
        note: l.note || null,
        lineTotal: l.lineTotal,
      })),
    );

    for (const line of lines) {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${line.qty}`, updatedAt: createdAt })
        .where(and(eq(products.id, line.product.id), eq(products.storeId, store.id)));
      await tx.insert(stockMovements).values({
        storeId: store.id,
        productId: line.product.id,
        delta: -line.qty,
        reason: "sale",
        refType: "order",
        refId: order.id,
        userId: user.id,
        createdAt,
      });
    }

    if (customerId) {
      await tx
        .update(customers)
        .set({
          points: sql`${customers.points} + ${pointsEarned}`,
          totalSpent: sql`${customers.totalSpent} + ${totals.total}`,
        })
        .where(eq(customers.id, customerId));
    }

    return {
      ok: true as const,
      orderId: order.id,
      number: order.number,
      changeDue,
      total: totals.total,
    };
  });
}

export type RefundResult = { ok: true } | { ok: false; error: string };

export async function refundOrderAction(
  orderId: number,
  reason: string,
): Promise<RefundResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  const { user, store } = auth;
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "Pesanan tidak valid." };
  }
  const trimmed = reason.trim();
  if (trimmed.length < 3 || trimmed.length > 160) {
    return { ok: false, error: "Alasan refund 3–160 karakter." };
  }

  const result = await db.transaction(async (tx) => {
    const found = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.storeId, store.id)))
      .for("update");
    const order = found[0];
    if (!order) return { ok: false as const, error: "Pesanan tidak ditemukan." };
    if (order.status === "refunded") {
      return { ok: false as const, error: "Pesanan ini sudah direfund." };
    }

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    const now = new Date();
    for (const item of items) {
      if (!item.productId) continue;
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${item.qty}`, updatedAt: now })
        .where(
          and(
            eq(products.id, item.productId),
            eq(products.storeId, store.id),
          ),
        );
      await tx.insert(stockMovements).values({
        storeId: store.id,
        productId: item.productId,
        delta: item.qty,
        reason: "refund",
        refType: "order",
        refId: order.id,
        userId: user.id,
        note: trimmed,
        createdAt: now,
      });
    }

    await tx
      .update(orders)
      .set({ status: "refunded", refundedAt: now, refundedBy: user.id })
      .where(eq(orders.id, orderId));

    if (order.customerId) {
      await tx
        .update(customers)
        .set({
          points: sql`max(0, ${customers.points} - ${order.pointsEarned})`,
          totalSpent: sql`max(0, ${customers.totalSpent} - ${order.total})`,
        })
        .where(
          and(
            eq(customers.id, order.customerId),
            eq(customers.storeId, store.id),
          ),
        );
    }

    return { ok: true as const };
  });

  if (result.ok) {
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/reports");
    revalidatePath("/");
  }
  return result;
}