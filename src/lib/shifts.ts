import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { orderPayments, orders, shifts } from "./db/schema";

export async function getOpenShift(userId: number, storeId: number) {
  const found = await db
    .select()
    .from(shifts)
    .where(
      and(
        eq(shifts.userId, userId),
        eq(shifts.storeId, storeId),
        eq(shifts.status, "open"),
      ),
    )
    .limit(1);
  return found[0];
}

export type ShiftSummary = {
  orderCount: number;
  grossSales: number;
  netSales: number;
  cashIn: number;
  refundTotal: number;
  cashRefundOut: number;
};

/**
 * Kas tunai shift = kas awal + tunai masuk − refund tunai keluar.
 * Refund tunai dihitung proporsional porsi tunai pesanan, jadi refund penuh
 * mengembalikan seluruh porsi tunai dan refund parsial hanya bagiannya.
 */
export async function getShiftSummary(
  shiftId: number,
  storeId: number,
): Promise<ShiftSummary> {
  const [shiftOrders, paymentRows] = await Promise.all([
    db
      .select({ id: orders.id, total: orders.total, refundedTotal: orders.refundedTotal })
      .from(orders)
      .where(and(eq(orders.shiftId, shiftId), eq(orders.storeId, storeId))),
    db
      .select({
        orderId: orderPayments.orderId,
        method: orderPayments.method,
        amount: orderPayments.amount,
      })
      .from(orderPayments)
      .innerJoin(orders, eq(orderPayments.orderId, orders.id))
      .where(and(eq(orders.shiftId, shiftId), eq(orders.storeId, storeId))),
  ]);

  const cashByOrder = new Map<number, number>();
  let cashIn = 0;
  for (const row of paymentRows) {
    if (row.method !== "cash") continue;
    cashIn += row.amount;
    cashByOrder.set(row.orderId, (cashByOrder.get(row.orderId) ?? 0) + row.amount);
  }

  let grossSales = 0;
  let refundTotal = 0;
  let cashRefundOut = 0;
  for (const order of shiftOrders) {
    grossSales += order.total;
    if (order.refundedTotal <= 0) continue;
    refundTotal += order.refundedTotal;
    if (order.total <= 0) continue;
    const cashPortion = cashByOrder.get(order.id) ?? 0;
    cashRefundOut += Math.round((order.refundedTotal * cashPortion) / order.total);
  }

  return {
    orderCount: shiftOrders.length,
    grossSales,
    netSales: grossSales - refundTotal,
    cashIn,
    refundTotal,
    cashRefundOut,
  };
}
