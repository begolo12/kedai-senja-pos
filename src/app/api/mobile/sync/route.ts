import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  categories,
  customers,
  orderItems,
  orders,
  products,
  shifts,
  stockMovements,
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
  createdAt: z.string().datetime(),
  note: z.string().trim().max(160).optional(),
});

const payloadSchema = z.object({
  orders: z.array(orderSchema).max(60).default([]),
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
  const [productRows, categoryRows, customerRows, settingsRow] = await Promise.all([
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
    },
    categories: categoryRows,
    products: productRows,
    customers: customerRows,
    serverTime: new Date().toISOString(),
  };
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

  const expected = computeTotals(
    input.items.map((item) => ({ unitPrice: item.unitPrice, qty: item.qty })),
    {
      discountType: input.discountType,
      discountValue: input.discountValue,
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
        subtotal: input.subtotal,
        discountType: input.discountType,
        discountValue: input.discountValue,
        discountAmount: input.discountAmount,
        taxAmount: input.taxAmount,
        total: input.total,
        costTotal: input.costTotal,
        pointsEarned: 0,
        orderType: input.orderType,
        tableLabel: input.tableLabel || null,
        paymentMethod: input.paymentMethod,
        amountPaid: input.amountPaid,
        changeDue: input.changeDue,
        note: input.note ?? "Pesanan offline",
        createdAt,
      })
      .returning({ id: orders.id, number: orders.number });

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
    ...(await pullSnapshot(context.store.id)),
  });
}