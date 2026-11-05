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
import { deductForSale } from "@/lib/recipes";
import { pointsWithMultiplier, resolveTier } from "@/lib/tiers";

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
  /** Pelanggan buatan offline: dihubungkan setelah unggahan newCustomers. */
  customerClientId: z.string().uuid().nullable().optional(),
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
  customerMap: Map<string, number>,
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

  // Seluruh validasi harga, stok, voucher, dan poin dijalankan dalam transaksi
  // dengan FOR UPDATE untuk mencegah manipulasi klien dan race condition.
  const created = await db.transaction(async (tx) => {
    // 1. Idempotensi ulang di dalam tx
    const again = await tx
      .select({ id: orders.id, number: orders.number })
      .from(orders)
      .where(eq(orders.clientId, input.clientId))
      .limit(1);
    if (again[0]) {
      return { status: "exists" as const, id: again[0].id, number: again[0].number };
    }

    // 2. Lock & validasi produk: harga dan modal WAJIB cocok dengan DB
    const saleLines: { product: typeof products.$inferSelect; qty: number }[] = [];
    const itemRecords: {
      productId: number;
      name: string;
      sku: string;
      unitPrice: number;
      cost: number;
      qty: number;
      note?: string;
      lineTotal: number;
    }[] = [];

    for (const item of input.items) {
      const found = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, item.productId), eq(products.storeId, storeId)))
        .for("update");
      const prod = found[0];
      if (!prod || !prod.active) {
        throw new Error(`Produk ${item.name} tidak aktif atau tidak ditemukan.`);
      }
      if (prod.price !== item.unitPrice) {
        throw new Error(`Harga ${prod.name} tidak cocok dengan sistem.`);
      }
      saleLines.push({ product: prod, qty: item.qty });
      itemRecords.push({
        productId: prod.id,
        name: prod.name,
        sku: prod.sku,
        unitPrice: prod.price,
        cost: prod.cost,
        qty: item.qty,
        note: item.note,
        lineTotal: prod.price * item.qty,
      });
    }

    const subtotal = itemRecords.reduce((sum, item) => sum + item.lineTotal, 0);
    const rawManual =
      input.discountType === "percent"
        ? Math.round((subtotal * Math.min(100, Math.max(0, input.discountValue))) / 100)
        : input.discountType === "amount"
          ? Math.max(0, Math.round(input.discountValue))
          : 0;
    const manualDiscount = Math.min(subtotal, rawManual);

    // 3. Lock & validasi voucher di dalam transaksi
    const code = input.voucherCode?.trim().toUpperCase() ?? "";
    let voucherRow: typeof vouchers.$inferSelect | null = null;
    let voucherAmount = 0;
    if (code) {
      const found = await tx
        .select()
        .from(vouchers)
        .where(and(eq(vouchers.storeId, storeId), eq(vouchers.code, code)))
        .for("update")
        .limit(1);
      const v = found[0] ?? null;
      const now = Date.now();
      if (
        !v ||
        !v.active ||
        (v.startsAt && v.startsAt.getTime() > now) ||
        (v.endsAt && v.endsAt.getTime() < now) ||
        (v.usageLimit > 0 && v.usedCount >= v.usageLimit) ||
        subtotal < v.minSubtotal
      ) {
        throw new Error(`Voucher ${code} tidak valid atau sudah habis.`);
      }
      voucherRow = v;
      const raw =
        v.type === "percent"
          ? Math.round((subtotal * Math.min(100, Math.max(0, v.value))) / 100)
          : Math.max(0, Math.round(v.value));
      voucherAmount = Math.min(subtotal - manualDiscount, raw);
    }

    // 4. Lock & validasi pelanggan di dalam transaksi
    const customerId: number | null =
      input.customerId ??
      (input.customerClientId ? customerMap.get(input.customerClientId) ?? null : null);
    let customerPoints = 0;
    let customerSpent = 0;
    if (customerId) {
      const found = await tx
        .select({ id: customers.id, points: customers.points, totalSpent: customers.totalSpent })
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.storeId, storeId)))
        .for("update")
        .limit(1);
      if (!found[0]) {
        throw new Error("Pelanggan tidak ditemukan.");
      }
      customerPoints = found[0].points;
      customerSpent = found[0].totalSpent;
    }

    let pointsRedeemed = 0;
    let redeemAmount = 0;
    if (input.pointsRedeem > 0) {
      if (!customerId || settings.pointsValue <= 0 || input.pointsRedeem > customerPoints) {
        throw new Error("Tukar poin tidak valid.");
      }
      pointsRedeemed = input.pointsRedeem;
      redeemAmount = Math.min(
        Math.max(0, subtotal - manualDiscount - voucherAmount),
        pointsRedeemed * settings.pointsValue,
      );
    }

    // 5. Verifikasi total dengan taxRate server (settings.taxRate), BUKAN input.taxRate
    const expected = computeTotals(
      itemRecords.map((item) => ({ unitPrice: item.unitPrice, qty: item.qty })),
      {
        discountType: input.discountType,
        discountValue: input.discountValue,
        fixedDiscount: voucherAmount + redeemAmount,
        taxRate: settings.taxRate,
      },
    );

    if (
      expected.subtotal !== input.subtotal ||
      expected.discountAmount !== input.discountAmount ||
      expected.taxAmount !== input.taxAmount ||
      expected.total !== input.total
    ) {
      throw new Error("Total tagihan tidak cocok dengan perhitungan server.");
    }

    if (input.paymentMethod === "cash") {
      if (input.amountPaid < input.total || input.changeDue !== input.amountPaid - input.total) {
        throw new Error("Pembayaran tunai tidak valid.");
      }
    } else if (input.amountPaid !== input.total || input.changeDue !== 0) {
      throw new Error("Pembayaran non-tunai tidak valid.");
    }

    const multiplier =
      (await resolveTier(storeId, customerSpent, tx))?.pointsMultiplier ?? 100;
    const pointsEarned =
      customerId && settings.pointsPerAmount
        ? pointsWithMultiplier(Math.floor(input.total / settings.pointsPerAmount), multiplier)
        : 0;

    await tx.execute(sql`select pg_advisory_xact_lock(771122)`);
    let shiftRows = await tx
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

    // Mobile tidak punya layar shift: tanpa shift otomatis, order tunai
    // offline tersimpan tanpa shift dan tidak pernah masuk rekonsiliasi
    // laci. Shift dibuka dengan kas awal 0 dan ditutup dari web.
    if (!shiftRows[0]) {
      shiftRows = await tx
        .insert(shifts)
        .values({ storeId, userId, openingFloat: 0 })
        .returning({ id: shifts.id });
    }

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

    const [order] = await tx
      .insert(orders)
      .values({
        number: orderNumber(createdAt, Number(countToday ?? 0) + 1),
        clientId: input.clientId,
        storeId,
        shiftId: shiftRows[0]?.id ?? null,
        userId,
        customerId,
        subtotal: expected.subtotal,
        discountType: input.discountType,
        discountValue: input.discountValue,
        discountAmount: expected.discountAmount,
        taxAmount: expected.taxAmount,
        total: expected.total,
        costTotal: itemRecords.reduce((sum, item) => sum + item.cost * item.qty, 0),
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

    await tx.insert(orderPayments).values({
      orderId: order.id,
      method: input.paymentMethod,
      amount: expected.total,
    });

    await tx.insert(orderItems).values(
      itemRecords.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        unitPrice: item.unitPrice,
        cost: item.cost,
        qty: item.qty,
        note: item.note || null,
        lineTotal: item.lineTotal,
      })),
    );

    const deducted = await deductForSale(tx, {
      storeId,
      userId,
      orderId: order.id,
      lines: saleLines,
      createdAt,
    });
    if (!deducted.ok) {
      throw new Error(deducted.error);
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
          totalSpent: sql`${customers.totalSpent} + ${expected.total}`,
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
  const customerMap = new Map<string, number>();
  for (const entry of customerResults) {
    if (entry.id) customerMap.set(entry.clientId, entry.id);
  }
  for (const order of parsed.data.orders) {
    try {
      results.push(
        await pushOrder(context.user.id, context.store.id, order, customerMap),
      );
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