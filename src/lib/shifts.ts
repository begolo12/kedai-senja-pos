import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { expenses, orderPayments, orders, shifts } from "./db/schema";

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
  expenseTotal: number;
};

/**
 * Kas tunai shift = kas awal + tunai masuk − refund tunai keluar − pengeluaran.
 * Refund tunai dihitung proporsional porsi tunai pesanan, jadi refund penuh
 * mengembalikan seluruh porsi tunai dan refund parsial hanya bagiannya.
 */
export async function getShiftSummary(
  shiftId: number,
  storeId: number,
): Promise<ShiftSummary> {
  const [shiftOrders, paymentRows, expenseRows] = await Promise.all([
    db
      .select({ id: orders.id, total: orders.total, refundedTotal: orders.refundedTotal })
      .from(orders)
      .where(
        and(
          eq(orders.shiftId, shiftId),
          eq(orders.storeId, storeId),
          // Tagihan meja belum dibayar tidak masuk kas; dihitung saat settle.
          inArray(orders.status, ["completed", "partially_refunded"]),
        ),
      ),
    db
      .select({
        orderId: orderPayments.orderId,
        method: orderPayments.method,
        amount: orderPayments.amount,
      })
      .from(orderPayments)
      .innerJoin(orders, eq(orderPayments.orderId, orders.id))
      .where(and(eq(orders.shiftId, shiftId), eq(orders.storeId, storeId))),
    db
      .select({ amount: expenses.amount })
      .from(expenses)
      .where(and(eq(expenses.shiftId, shiftId), eq(expenses.storeId, storeId))),
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
    expenseTotal: expenseRows.reduce((sum, row) => sum + Number(row.amount), 0),
  };
}
