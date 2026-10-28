import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  categories,
  customers,
  orderItems,
  orderPayments,
  orders,
  products,
  shifts,
  stockMovements,
  vouchers,
} from "@/lib/db/schema";
import {
  corsHeaders,
  getMobileContext,
  json,
  mobileStore,
  mobileUser,
} from "@/lib/mobile-auth";
import { computeTotals, orderNumber } from "@/lib/money";
import { dayStart, DAY_MS } from "@/lib/dates";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";

const itemSchema = z.object({
  productId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(60),
  unitPrice: z.number().int().min(0),
  cost: z.number().int().min(0),
  qty: z.number().int().min(1).max(999),
  note: z.string().trim().max(160).optional(),
});

const orderSchema = z.object({
  clientId: z.string().uuid(),
  items: z.array(itemSchema).min(1).max(60),
  discountType: z.enum(["amount", "percent"]).nullable(),
  discountValue: z.number().int().min(0),
  taxRate: z.number().int().min(0).max(5000),
  subtotal: z.number().int().min(0),
  discountAmount: z.number().int().min(0),
  taxAmount: z.number().int().min(0),
  total: z.number().int().min(1),
  costTotal: z.number().int().min(0),
  orderType: z.enum(["dine_in", "takeaway"]).default("dine_in"),
  tableLabel: z.string().trim().max(40).optional(),
  paymentMethod: z.enum(["cash", "card", "qris"]),
  amountPaid: z.number().int().min(0),
  changeDue: z.number().int().min(0),
  customerId: z.number().int().positive().nullable().optional(),
  pointsRedeem: z.number().int().min(0).max(100_000).default(0),
  voucherCode: z
    .string()
    .trim()
    .max(32)
    .regex(/^[A-Za-z0-9-]*$/, "Kode voucher tidak valid.")
    .optional(),
  createdAt: z.string().datetime(),
  note: z.string().trim().max(160).optional(),
});

const newCustomerSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20).optional(),
});

const payloadSchema = z.object({
  orders: z.array(orderSchema).max(60).default([]),
  newCustomers: z.array(newCustomerSchema).max(60).default([]),
});

type OrderInput = z.infer<typeof orderSchema>;
type SyncResult = {
  clientId: string;
  status: "created" | "exists" | "rejected";
  orderId?: number;
  number?: string;
  error?: string;
};

async function pullSnapshot(storeId: number) {
  const [productRows, categoryRows, customerRows, settingsRow, voucherRows] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        barcode: products.barcode,
        categoryId: products.categoryId,
        price: products.price,
        cost: products.cost,
        stock: products.stock,
        unit: products.unit,
        options: products.options,
      })
      .from(products)
      .where(and(eq(products.storeId, storeId), eq(products.active, true)))
      .orderBy(products.name),
    db
      .select()
      .from(categories)
      .where(eq(categories.storeId, storeId))
      .orderBy(categories.sortOrder),
    db
      .select({ id: customers.id, name: customers.name, phone: customers.phone, points: customers.points })
      .from(customers)
      .where(eq(customers.storeId, storeId))
      .orderBy(customers.name),
    getSettings(storeId),
    db
      .select({
        code: vouchers.code,
        label: vouchers.label,
        type: vouchers.type,
        value: vouchers.value,
        minSubtotal: vouchers.minSubtotal,
        startsAt: vouchers.startsAt,
        endsAt: vouchers.endsAt,
        usageLimit: vouchers.usageLimit,
        usedCount: vouchers.usedCount,
      })
      .from(vouchers)
      .where(and(eq(vouchers.storeId, storeId), eq(vouchers.active, true)))
      .orderBy(vouchers.code),
  ]);

  return {
    settings: {
      storeName: settingsRow.storeName,
      address: settingsRow.address,
      phone: settingsRow.phone,
      currency: settingsRow.currency,
      taxRate: settingsRow.taxRate,
      receiptWidth: settingsRow.receiptWidth,
      qrisPayload: settingsRow.qrisPayload,
      receiptFooter: settingsRow.receiptFooter,
      pointsPerAmount: settingsRow.pointsPerAmount,
      pointsValue: settingsRow.pointsValue,
    },
    categories: categoryRows,
    products: productRows,
    customers: customerRows,
    vouchers: voucherRows,
    serverTime: new Date().toISOString(),
  };
}

type CustomerSyncResult = { clientId: string; status: "created" | "exists"; id?: number };

/** Pelanggan yang dibuat offline diunggah dua arah; telepon unik per toko. */
async function pushCustomers(
  storeId: number,
  entries: { clientId: string; name: string; phone?: string }[],
): Promise<CustomerSyncResult[]> {
  const results: CustomerSyncResult[] = [];
  for (const entry of entries) {
    try {
      if (entry.phone) {
        const clash = await db
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(eq(customers.storeId, storeId), eq(customers.phone, entry.phone)),
          )
          .limit(1);
        if (clash[0]) {
          results.push({ clientId: entry.clientId, status: "exists", id: clash[0].id });
          continue;
        }
      }
      const [row] = await db
        .insert(customers)
        .values({ storeId, name: entry.name, phone: entry.phone ?? null })
        .returning({ id: customers.id });
      results.push({ clientId: entry.clientId, status: "created", id: row.id });
    } catch {
      results.push({ clientId: entry.clientId, status: "exists" });
    }
  }
  return results;
}

async function pushOrder(
  userId: number,
  storeId: number,
  input: OrderInput,
): Promise<SyncResult> {
  const existing = await db
    .select({ id: orders.id, number: orders.number, storeId: orders.storeId })
    .from(orders)
    .where(eq(orders.clientId, input.clientId))
    .limit(1);
  if (existing[0] && existing[0].storeId !== storeId) {
    return { clientId: input.clientId, status: "rejected", error: "ID pesanan bentrok." };
  }
  if (existing[0]) {
    return {
      clientId: input.clientId,
      status: "exists",
      orderId: existing[0].id,
      number: existing[0].number,
    };
  }

  const settings = await getSettings(storeId);

  // Voucher dan poin divalidasi ulang dari DB — angka klien hanya petunjuk.
  const code = input.voucherCode?.trim().toUpperCase() ?? "";
  let voucherRow: typeof vouchers.$inferSelect | null = null;
  let voucherAmount = 0;
  if (code) {
    const found = await db
      .select()
      .from(vouchers)
      .where(and(eq(vouchers.storeId, storeId), eq(vouchers.code, code)))
      .limit(1);
    const v = found[0] ?? null;
    const now = Date.now();
    if (
      !v ||
      !v.active ||
      (v.startsAt && v.startsAt.getTime() > now) ||
      (v.endsAt && v.endsAt.getTime() < now) ||
      (v.usageLimit > 0 && v.usedCount >= v.usageLimit) ||
      input.subtotal < v.minSubtotal
    ) {
      return { clientId: input.clientId, status: "rejected", error: `Voucher ${code} tidak valid.` };
    }
    voucherRow = v;
    voucherAmount = Math.min(
      input.subtotal,
      v.type === "percent"
        ? Math.round((input.subtotal * Math.min(100, Math.max(0, v.value))) / 100)
        : Math.max(0, Math.round(v.value)),
    );
  }

  const customerId: number | null = input.customerId ?? null;
  let customerPoints = 0;
  if (customerId) {
    const found = await db
      .select({ id: customers.id, points: customers.points })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.storeId, storeId)))
      .limit(1);
    if (!found[0]) {
      return { clientId: input.clientId, status: "rejected", error: "Pelanggan tidak ditemukan." };
    }
    customerPoints = found[0].points;
  }
  let pointsRedeemed = 0;
  let redeemAmount = 0;
  if (input.pointsRedeem > 0) {
    if (!customerId || settings.pointsValue <= 0 || input.pointsRedeem > customerPoints) {
      return { clientId: input.clientId, status: "rejected", error: "Tukar poin tidak valid." };
    }
    pointsRedeemed = input.pointsRedeem;
    redeemAmount = Math.min(
      Math.max(0, input.subtotal - voucherAmount),
      pointsRedeemed * settings.pointsValue,
    );
  }

  const expected = computeTotals(
    input.items.map((item) => ({ unitPrice: item.unitPrice, qty: item.qty })),
    {
      discountType: input.discountType,
      discountValue: input.discountValue,
      fixedDiscount: voucherAmount + redeemAmount,
      taxRate: input.taxRate,
    },
  );
  if (
    expected.subtotal !== input.subtotal ||
    expected.discountAmount !== input.discountAmount ||
    expected.taxAmount !== input.taxAmount ||
    expected.total !== input.total
  ) {
    return {
      clientId: input.clientId,
      status: "rejected",
      error: "Total tidak cocok dengan perhitungan server.",
    };
  }
  if (input.paymentMethod === "cash") {
    if (input.amountPaid < input.total || input.changeDue !== input.amountPaid - input.total) {
      return { clientId: input.clientId, status: "rejected", error: "Pembayaran tunai tidak valid." };
    }
  } else if (input.amountPaid !== input.total || input.changeDue !== 0) {
    return { clientId: input.clientId, status: "rejected", error: "Pembayaran non-tunai tidak valid." };
  }

  const created = await db.transaction(async (tx) => {
    const pointsEarned =
      customerId && settings.pointsPerAmount
        ? Math.floor(input.total / settings.pointsPerAmount)
        : 0;
    const again = await tx
      .select({ id: orders.id, number: orders.number })
      .from(orders)
      .where(eq(orders.clientId, input.clientId))
      .limit(1);
    if (again[0]) {
      return { status: "exists" as const, id: again[0].id, number: again[0].number };
    }

    await tx.execute(sql`select pg_advisory_xact_lock(771122)`);
    const shiftRows = await tx
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        and(
          eq(shifts.userId, userId),
          eq(shifts.storeId, storeId),
          eq(shifts.status, "open"),
        ),
      )
      .limit(1);

    const now = new Date();
    const deviceTime = new Date(input.createdAt);
    const createdAt =
      Number.isNaN(deviceTime.getTime()) || deviceTime.getTime() > now.getTime()
        ? now
        : deviceTime;
    const start = dayStart(createdAt);
    const countToday = (
      await tx
        .select({ n: sql<string>`count(*)` })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            sql`${orders.createdAt} >= ${new Date(start)} and ${orders.createdAt} < ${new Date(start + DAY_MS)}`,
          ),
        )
    )[0]?.n;

    const knownProducts = new Set<number>();
    for (const item of input.items) {
      const found = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, item.productId), eq(products.storeId, storeId)))
        .for("update");
      if (found[0]) {
        knownProducts.add(item.productId);
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${item.qty}`, updatedAt: now })
          .where(and(eq(products.id, item.productId), eq(products.storeId, storeId)));
      }
    }

    const [order] = await tx
      .insert(orders)
      .values({
        number: orderNumber(createdAt, Number(countToday ?? 0) + 1),
        clientId: input.clientId,
        storeId,
        shiftId: shiftRows[0]?.id ?? null,
        userId,
        customerId,
        subtotal: input.subtotal,
        discountType: input.discountType,
        discountValue: input.discountValue,
        discountAmount: input.discountAmount,
        taxAmount: input.taxAmount,
        total: input.total,
        costTotal: input.costTotal,
        pointsEarned,
        pointsRedeemed,
        redeemAmount,
        voucherCode: voucherRow?.code ?? null,
        voucherAmount,
        orderType: input.orderType,
        tableLabel: input.tableLabel || null,
        paymentMethod: input.paymentMethod,
        amountPaid: input.amountPaid,
        changeDue: input.changeDue,
        note: input.note ?? "Pesanan offline",
        createdAt,
      })
      .returning({ id: orders.id, number: orders.number });

    // Baris pembayaran menyimpan nilai bersih: sama dengan total.
    await tx.insert(orderPayments).values({
      orderId: order.id,
      method: input.paymentMethod,
      amount: input.total,
    });

    await tx.insert(orderItems).values(
      input.items.map((item) => ({
        orderId: order.id,
        productId: knownProducts.has(item.productId) ? item.productId : null,
        name: item.name,
        sku: item.sku,
        unitPrice: item.unitPrice,
        cost: item.cost,
        qty: item.qty,
        note: item.note || null,
        lineTotal: item.unitPrice * item.qty,
      })),
    );

    for (const item of input.items) {
      if (!knownProducts.has(item.productId)) continue;
      await tx.insert(stockMovements).values({
        storeId,
        productId: item.productId,
        delta: -item.qty,
        reason: "sale",
        refType: "order",
        refId: order.id,
        userId,
        note: "Sinkron offline",
        createdAt,
      });
    }

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
          totalSpent: sql`${customers.totalSpent} + ${input.total}`,
        })
        .where(eq(customers.id, customerId));
    }

    return { status: "created" as const, id: order.id, number: order.number };
  });

  return {
    clientId: input.clientId,
    status: created.status,
    orderId: created.id,
    number: created.number,
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  const context = await getMobileContext(request);
  if (!context) return json(request, { error: "Unauthorized" }, 401);
  return json(request, {
    user: mobileUser(context.user),
    store: mobileStore(context.store),
    ...(await pullSnapshot(context.store.id)),
  });
}

export async function POST(request: Request) {
  const context = await getMobileContext(request);
  if (!context) return json(request, { error: "Unauthorized" }, 401);

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json(request, { error: "Payload sinkron tidak valid." }, 400);
  }

  const customerResults = await pushCustomers(
    context.store.id,
    parsed.data.newCustomers,
  );

  const results: SyncResult[] = [];
  for (const order of parsed.data.orders) {
    try {
      results.push(await pushOrder(context.user.id, context.store.id, order));
    } catch (error) {
      results.push({
        clientId: order.clientId,
        status: "rejected",
        error: error instanceof Error ? error.message.slice(0, 160) : "Gagal menyimpan.",
      });
    }
  }

  return json(request, {
    user: mobileUser(context.user),
    store: mobileStore(context.store),
    results,
    customerResults,
    ...(await pullSnapshot(context.store.id)),
  });
}