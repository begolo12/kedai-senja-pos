"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  products,
  purchaseOrderItems,
  purchaseOrders,
  stockMovements,
  suppliers,
} from "@/lib/db/schema";
import { assertAdmin, type ActionResult } from "@/lib/auth";
import { purchaseOrderSchema, supplierSchema } from "@/lib/validation";

export async function saveSupplierAction(input: unknown): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  const { store } = auth;

  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const data = parsed.data;

  const clash = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.storeId, store.id), eq(suppliers.name, data.name)))
    .limit(1);
  if (clash[0] && clash[0].id !== data.id) {
    return { ok: false, error: `Supplier ${data.name} sudah ada.` };
  }

  if (data.id) {
    const found = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, data.id), eq(suppliers.storeId, store.id)))
      .limit(1);
    if (!found[0]) return { ok: false, error: "Supplier tidak ditemukan." };
    await db
      .update(suppliers)
      .set({
        name: data.name,
        phone: data.phone || "",
        note: data.note || "",
        active: data.active,
      })
      .where(and(eq(suppliers.id, data.id), eq(suppliers.storeId, store.id)));
  } else {
    await db.insert(suppliers).values({
      storeId: store.id,
      name: data.name,
      phone: data.phone || "",
      note: data.note || "",
      active: data.active,
    });
  }

  revalidatePath("/purchases");
  return { ok: true };
}

export async function toggleSupplierAction(id: number): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  const { store } = auth;
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Supplier tidak valid." };
  }

  const found = await db
    .select({ active: suppliers.active })
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.storeId, store.id)))
    .limit(1);
  const current = found[0];
  if (!current) return { ok: false, error: "Supplier tidak ditemukan." };

  await db
    .update(suppliers)
    .set({ active: !current.active })
    .where(and(eq(suppliers.id, id), eq(suppliers.storeId, store.id)));

  revalidatePath("/purchases");
  return { ok: true };
}

export async function createPurchaseOrderAction(input: unknown): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  const { user, store } = auth;

  const parsed = purchaseOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const data = parsed.data;

  if (data.supplierId) {
    const found = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, data.supplierId), eq(suppliers.storeId, store.id)))
      .limit(1);
    if (!found[0]) return { ok: false, error: "Supplier tidak ditemukan." };
  }

  const merged = new Map<number, { productId: number; qty: number; unitCost: number }>();
  for (const item of data.items) {
    const existing = merged.get(item.productId);
    merged.set(item.productId, {
      productId: item.productId,
      qty: (existing?.qty ?? 0) + item.qty,
      unitCost: item.unitCost,
    });
  }

  const rows: {
    productId: number;
    qty: number;
    unitCost: number;
    id: number;
    name: string;
    unit: string;
  }[] = [];
  for (const item of merged.values()) {
    const found = await db
      .select({ id: products.id, name: products.name, unit: products.unit })
      .from(products)
      .where(and(eq(products.id, item.productId), eq(products.storeId, store.id)))
      .limit(1);
    if (!found[0]) return { ok: false, error: "Produk tidak ditemukan." };
    rows.push({ ...item, ...found[0] });
  }

  const expected = data.expectedAt?.trim();
  const [y, m, d] = expected ? expected.split("-").map(Number) : [];
  const expectedAt =
    y && m && d && !Number.isNaN(new Date(y, m - 1, d).getTime())
      ? new Date(y, m - 1, d)
      : null;

  await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(purchaseOrders)
      .values({
        storeId: store.id,
        supplierId: data.supplierId,
        userId: user.id,
        note: data.note || null,
        totalCost: rows.reduce((sum, row) => sum + row.unitCost * row.qty, 0),
        expectedAt,
      })
      .returning({ id: purchaseOrders.id });
    await tx.insert(purchaseOrderItems).values(
      rows.map((row) => ({
        purchaseOrderId: order.id,
        productId: row.id,
        name: row.name,
        unit: row.unit,
        qty: row.qty,
        unitCost: row.unitCost,
      })),
    );
  });

  revalidatePath("/purchases");
  return { ok: true };
}

/** Terima PO: stok masuk penuh, movement restock tercatat per item. */
export async function receivePurchaseOrderAction(id: number): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  const { user, store } = auth;
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "PO tidak valid." };
  }

  const result = await db.transaction(async (tx) => {
    const found = await tx
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.storeId, store.id)))
      .for("update");
    const order = found[0];
    if (!order) return { ok: false as const, error: "PO tidak ditemukan." };
    if (order.status !== "ordered") {
      return { ok: false as const, error: "PO ini sudah tidak bisa diterima." };
    }

    const items = await tx
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, id));
    const now = new Date();
    for (const item of items) {
      await tx
        .update(purchaseOrderItems)
        .set({ receivedQty: item.qty })
        .where(eq(purchaseOrderItems.id, item.id));
      if (!item.productId) continue;
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${item.qty}`, updatedAt: now })
        .where(and(eq(products.id, item.productId), eq(products.storeId, store.id)));
      await tx.insert(stockMovements).values({
        storeId: store.id,
        productId: item.productId,
        delta: item.qty,
        reason: "restock",
        refType: "purchase",
        refId: order.id,
        userId: user.id,
        note: `PO #${order.id}`,
        createdAt: now,
      });
    }

    await tx
      .update(purchaseOrders)
      .set({ status: "received", receivedAt: now })
      .where(eq(purchaseOrders.id, id));

    return { ok: true as const };
  });

  if (result.ok) {
    revalidatePath("/purchases");
    revalidatePath("/inventory");
  }
  return result;
}

export async function cancelPurchaseOrderAction(id: number): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  const { store } = auth;
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "PO tidak valid." };
  }

  const found = await db
    .select({ status: purchaseOrders.status })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.storeId, store.id)))
    .limit(1);
  const current = found[0];
  if (!current) return { ok: false, error: "PO tidak ditemukan." };
  if (current.status !== "ordered") {
    return { ok: false, error: "Hanya PO berstatus dipesan yang bisa dibatalkan." };
  }

  await db
    .update(purchaseOrders)
    .set({ status: "cancelled" })
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.storeId, store.id)));

  revalidatePath("/purchases");
  return { ok: true };
}
