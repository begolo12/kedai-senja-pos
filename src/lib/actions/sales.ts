"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  customers,
  orderItems,
  orderPayments,
  orders,
  products,
  shifts,
  stockMovements,
  vouchers,
} from "@/lib/db/schema";
import { assertAdmin, assertStore } from "@/lib/auth";
import { computeTotals, orderNumber } from "@/lib/money";
import { dayStart } from "@/lib/dates";
import { deductForSale, restoreForRefund } from "@/lib/recipes";
import { pointsWithMultiplier, resolveTier } from "@/lib/tiers";
import { checkoutSchema } from "@/lib/validation";

export type CheckoutResult =
  | { ok: true; orderId: number; number: string; changeDue: number; total: number }
  | { ok: false; error: string };

/**
 * Normalises the two wire shapes into payment rows: split list or legacy single.
 * Rows store the *applied* amount: the cash row is net of change, so summing
 * rows equals the order total and shift cash math stays correct.
 */
function toPayments(
  data: { payments?: { method: "cash" | "card" | "qris"; amount: number }[] },
  fallbackMethod: "cash" | "card" | "qris",
  total: number,
): { method: "cash" | "card" | "qris"; amount: number }[] {
  const list = (data.payments ?? []).filter((p) => p.amount > 0);
  if (list.length > 0) return list;
  return [{ method: fallbackMethod, amount: total }];
}

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
    const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
    const rawManual =
      data.discountType === "percent"
        ? Math.round((subtotal * Math.min(100, Math.max(0, data.discountValue))) / 100)
        : data.discountType === "amount"
          ? Math.max(0, Math.round(data.discountValue))
          : 0;
    const manualDiscount = Math.min(subtotal, rawManual);

    // Voucher: server-side validation; kode dari klien hanya petunjuk.
    let voucherRow: typeof vouchers.$inferSelect | null = null;
    let voucherAmount = 0;
    const code = data.voucherCode?.trim().toUpperCase() ?? "";
    if (code) {
      const found = await tx
        .select()
        .from(vouchers)
        .where(and(eq(vouchers.storeId, store.id), eq(vouchers.code, code)))
        .for("update")
        .limit(1);
      const v = found[0] ?? null;
      const now = Date.now();
      if (!v || !v.active) {
        return { ok: false as const, error: `Voucher ${code} tidak ditemukan.` };
      }
      if (v.startsAt && v.startsAt.getTime() > now) {
        return { ok: false as const, error: `Voucher ${code} belum berlaku.` };
      }
      if (v.endsAt && v.endsAt.getTime() < now) {
        return { ok: false as const, error: `Voucher ${code} sudah kedaluwarsa.` };
      }
      if (v.usageLimit > 0 && v.usedCount >= v.usageLimit) {
        return { ok: false as const, error: `Voucher ${code} sudah habis dipakai.` };
      }
      if (subtotal < v.minSubtotal) {
        return {
          ok: false as const,
          error: `Voucher ${code} butuh belanja minimal ${v.minSubtotal / 100}.`,
        };
      }
      const raw =
        v.type === "percent"
          ? Math.round((subtotal * Math.min(100, Math.max(0, v.value))) / 100)
          : Math.max(0, Math.round(v.value));
      voucherRow = v;
      voucherAmount = Math.min(subtotal - manualDiscount, raw);
    }

    let customerId: number | null = null;
    let customerPoints = 0;
    let customerName = "";
    let customerSpent = 0;
    if (data.customerId) {
      const found = await tx
        .select({
          id: customers.id,
          points: customers.points,
          name: customers.name,
          totalSpent: customers.totalSpent,
        })
        .from(customers)
        .where(
          and(
            eq(customers.id, data.customerId),
            eq(customers.storeId, store.id),
          ),
        )
        .limit(1);
      customerId = found[0]?.id ?? null;
      customerPoints = found[0]?.points ?? 0;
      customerName = found[0]?.name ?? "";
      customerSpent = found[0]?.totalSpent ?? 0;
    }

    // Tukar poin: butuh pelanggan, nilai tukar aktif, dan poin cukup.
    let pointsRedeemed = 0;
    let redeemAmount = 0;
    if (data.pointsRedeem > 0) {
      if (!customerId) {
        return { ok: false as const, error: "Tukar poin butuh pelanggan terdaftar." };
      }
      if (store.pointsValue <= 0) {
        return { ok: false as const, error: "Tukar poin tidak diaktifkan di pengaturan." };
      }
      if (data.pointsRedeem > customerPoints) {
        return {
          ok: false as const,
          error: `Poin ${customerName || "pelanggan"} hanya ${customerPoints}.`,
        };
      }
      pointsRedeemed = data.pointsRedeem;
      redeemAmount = Math.min(
        Math.max(0, subtotal - manualDiscount - voucherAmount),
        pointsRedeemed * store.pointsValue,
      );
    }

    // Tier membership: kelipatan poin mengikuti total belanja SEBELUM pesanan ini.
    // Ikut koneksi transaksi agar tidak membuka koneksi pool baru.
    const multiplier =
      (await resolveTier(store.id, customerSpent, tx))?.pointsMultiplier ?? 100;

    const taxRate = store.taxRate;
    const totals = computeTotals(
      lines.map((l) => ({ unitPrice: l.product.price, qty: l.qty })),
      {
        discountType: data.discountType,
        discountValue: data.discountValue,
        fixedDiscount: voucherAmount + redeemAmount,
        taxRate,
      },
    );

    // Split payment: tunai boleh lebih untuk kembalian; non-tunai harus pas.
    const payments = toPayments(data, data.paymentMethod, totals.total);
    const cashTotal = payments
      .filter((p) => p.method === "cash")
      .reduce((sum, p) => sum + p.amount, 0);
    const nonCashTotal = payments
      .filter((p) => p.method !== "cash")
      .reduce((sum, p) => sum + p.amount, 0);
    if (nonCashTotal > totals.total) {
      return { ok: false as const, error: "Total pembayaran melebihi tagihan." };
    }
    if (cashTotal < totals.total - nonCashTotal) {
      return { ok: false as const, error: "Uang diterima kurang dari total." };
    }
    const changeDue = cashTotal - (totals.total - nonCashTotal);
    const amountPaid = cashTotal + nonCashTotal;
    const paymentMethod = payments.length > 1 ? "mixed" : payments[0].method;
    const appliedPayments = payments.map((p) =>
      p.method === "cash"
        ? { method: p.method, amount: totals.total - nonCashTotal }
        : p,
    );
    const createdAt = new Date();

    const pointsEarned =
      customerId && store.pointsPerAmount
        ? pointsWithMultiplier(
            Math.floor(totals.total / store.pointsPerAmount),
            multiplier,
          )
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
        pointsRedeemed,
        redeemAmount,
        voucherCode: voucherRow?.code ?? null,
        voucherAmount,
        orderType: data.orderType,
        tableLabel: data.tableLabel || null,
        paymentMethod,
        amountPaid,
        changeDue,
        note: data.note || null,
        createdAt,
      })
      .returning({ id: orders.id, number: orders.number });

    await tx.insert(orderPayments).values(
      appliedPayments.map((p) => ({ orderId: order.id, method: p.method, amount: p.amount })),
    );

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

    // Potong stok (produk berresep memotong bahan, bukan dirinya sendiri).
    const deducted = await deductForSale(tx, {
      storeId: store.id,
      userId: user.id,
      orderId: order.id,
      lines: lines.map((line) => ({ product: line.product, qty: line.qty })),
      createdAt,
    });
    if (!deducted.ok) return { ok: false as const, error: deducted.error };

    if (voucherRow) {
      await tx
        .update(vouchers)
        .set({ usedCount: sql`${vouchers.usedCount} + 1` })
        .where(eq(vouchers.id, voucherRow.id));
    }

    if (customerId) {
      await tx
        .update(customers)
        .set({
          points: sql`${customers.points} + ${pointsEarned} - ${pointsRedeemed}`,
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
  // Full refund: every item at its remaining quantity.
  const items = await db
    .select({ id: orderItems.id, remaining: sql<number>`${orderItems.qty} - ${orderItems.refundedQty}` })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  return refundOrderItems(
    orderId,
    items.map((item) => ({ itemId: item.id, qty: Number(item.remaining) })),
    reason,
  );
}

export async function refundOrderItemsAction(
  orderId: number,
  input: { itemId: number; qty: number }[],
  reason: string,
): Promise<RefundResult> {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: "Pilih minimal satu item untuk direfund." };
  }
  if (
    input.some(
      (row) => !Number.isInteger(row.itemId) || !Number.isInteger(row.qty) || row.qty < 1,
    )
  ) {
    return { ok: false, error: "Item refund tidak valid." };
  }
  return refundOrderItems(orderId, input, reason);
}

async function refundOrderItems(
  orderId: number,
  requested: { itemId: number; qty: number }[],
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
      return { ok: false as const, error: "Pesanan ini sudah direfund penuh." };
    }
    if (order.subtotal <= 0 || order.total <= 0) {
      return { ok: false as const, error: "Pesanan ini tidak bisa direfund." };
    }

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .for("update");
    const byId = new Map(items.map((item) => [item.id, item]));

    // Merge duplicate item ids, then validate against remaining quantities.
    const qtyById = new Map<number, number>();
    for (const row of requested) {
      qtyById.set(row.itemId, (qtyById.get(row.itemId) ?? 0) + row.qty);
    }
    for (const [itemId, qty] of qtyById) {
      const item = byId.get(itemId);
      if (!item) return { ok: false as const, error: "Item tidak termasuk pesanan ini." };
      const remaining = item.qty - item.refundedQty;
      if (qty > remaining) {
        return {
          ok: false as const,
          error: `${item.name}: maksimal refund ${remaining}.`,
        };
      }
    }

    // Refund follows the order's price structure: tax and discounts prorated
    // by subtotal share, so a full-item refund equals the original charge.
    let refundSubtotal = 0;
    for (const [itemId, qty] of qtyById) {
      const item = byId.get(itemId)!;
      refundSubtotal += Math.round((item.lineTotal / item.qty) * qty);
    }
    const refundAmount = Math.round((order.total * refundSubtotal) / order.subtotal);
    if (refundAmount <= 0) {
      return { ok: false as const, error: "Nilai refund tidak valid." };
    }

    const now = new Date();
    let fullyRefunded = true;
    for (const [itemId, qty] of qtyById) {
      const item = byId.get(itemId)!;
      const refundedQty = item.refundedQty + qty;
      if (refundedQty < item.qty) fullyRefunded = false;
      await tx
        .update(orderItems)
        .set({ refundedQty })
        .where(eq(orderItems.id, itemId));
    }
    // Items never touched by this request must also be exhausted for a full refund.
    if (items.some((item) => item.refundedQty + (qtyById.get(item.id) ?? 0) < item.qty)) {
      fullyRefunded = false;
    }

    // Stok kembali mengikuti resep: produk berresep mengembalikan bahannya.
    await restoreForRefund(tx, {
      storeId: store.id,
      userId: user.id,
      orderId: order.id,
      items: [...qtyById.entries()].map(([itemId, qty]) => {
        const item = byId.get(itemId)!;
        return { productId: item.productId, name: item.name, qty };
      }),
      reason: trimmed,
      createdAt: now,
    });

    // Poin dan total belanja dikoreksi proporsional nilai refund.
    const pointsBack = Math.round((order.pointsEarned * refundAmount) / order.total);
    const pointsRedeemedBack = Math.round(
      (order.pointsRedeemed * refundAmount) / order.total,
    );
    if (order.customerId) {
      await tx
        .update(customers)
        .set({
          points: sql`greatest(0, ${customers.points} - ${pointsBack} + ${pointsRedeemedBack})`,
          totalSpent: sql`greatest(0, ${customers.totalSpent} - ${refundAmount})`,
        })
        .where(
          and(
            eq(customers.id, order.customerId),
            eq(customers.storeId, store.id),
          ),
        );
    }
    if (fullyRefunded && order.voucherCode) {
      await tx
        .update(vouchers)
        .set({ usedCount: sql`greatest(0, ${vouchers.usedCount} - 1)` })
        .where(
          and(
            eq(vouchers.storeId, store.id),
            eq(vouchers.code, order.voucherCode),
          ),
        );
    }

    await tx
      .update(orders)
      .set({
        status: fullyRefunded ? "refunded" : "partially_refunded",
        refundedTotal: order.refundedTotal + refundAmount,
        refundedAt: now,
        refundedBy: user.id,
      })
      .where(eq(orders.id, orderId));

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
