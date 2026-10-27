"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  customers,
  orderItems,
  orders,
  products,
  settings,
  shifts,
  stockMovements,
} from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { computeTotals, orderNumber } from "@/lib/money";
import { dayStart } from "@/lib/dates";
import { checkoutSchema } from "@/lib/validation";

export type CheckoutResult =
  | { ok: true; orderId: number; number: string; changeDue: number; total: number }
  | { ok: false; error: string };

export async function checkoutAction(input: unknown): Promise<CheckoutResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sesi berakhir. Masuk ulang." };

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
        changeDue: orders.changeDue,
        total: orders.total,
      })
      .from(orders)
      .where(eq(orders.clientId, data.clientId))
      .limit(1);
    if (existing[0]) {
      return { ok: true as const, orderId: existing[0].id, ...existing[0] };
    }

    const openShifts = await tx
      .select()
      .from(shifts)
      .where(and(eq(shifts.userId, user.id), eq(shifts.status, "open")))
      .limit(1);
    const shift = openShifts[0];
    if (!shift) return { ok: false as const, error: "Buka shift dulu sebelum transaksi." };

    const merged = new Map<number, number>();
    for (const item of data.items) {
      merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.qty);
    }

    const rows = [];
    for (const [productId, qty] of merged) {
      const found = await tx
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .for("update");
      rows.push({ product: found[0], qty });
    }

    for (const row of rows) {
      if (!row.product) return { ok: false as const, error: "Produk tidak ditemukan." };
      if (!row.product.active) {
        return { ok: false as const, error: `${row.product.name} sedang tidak dijual.` };
      }
      if (row.product.stock < row.qty) {
        return {
          ok: false as const,
          error: `Stok ${row.product.name} tinggal ${row.product.stock}.`,
        };
      }
    }

    const lines = rows.map(({ product, qty }) => ({
      product: product!,
      qty,
      lineTotal: product!.price * qty,
    }));
    const config = (
      await tx
        .select({ taxRate: settings.taxRate, pointsPerAmount: settings.pointsPerAmount })
        .from(settings)
        .where(eq(settings.id, 1))
        .limit(1)
    )[0];
    const taxRate = config?.taxRate ?? 0;
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
        .where(eq(customers.id, data.customerId))
        .limit(1);
      customerId = found[0]?.id ?? null;
    }

    const pointsEarned =
      customerId && config?.pointsPerAmount
        ? Math.floor(totals.total / config.pointsPerAmount)
        : 0;

    // Serialises the daily sequence; single-store scale makes this cheap and safe.
    await tx.execute(sql`select pg_advisory_xact_lock(771122)`);
    const countToday = (
      await tx
        .select({ n: sql<string>`count(*)` })
        .from(orders)
        .where(sql`${orders.createdAt} >= ${new Date(dayStart(createdAt))}`)
    )[0]?.n;

    const [order] = await tx
      .insert(orders)
      .values({
        number: orderNumber(createdAt, Number(countToday ?? 0) + 1),
        clientId: data.clientId,
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
        lineTotal: l.lineTotal,
      })),
    );

    for (const line of lines) {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${line.qty}`, updatedAt: createdAt })
        .where(eq(products.id, line.product.id));
      await tx.insert(stockMovements).values({
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
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sesi berakhir. Masuk ulang." };
  if (user.role !== "admin") return { ok: false, error: "Hanya admin yang boleh refund." };
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
      .where(eq(orders.id, orderId))
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
        .where(eq(products.id, item.productId));
      await tx.insert(stockMovements).values({
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
        .where(eq(customers.id, order.customerId));
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