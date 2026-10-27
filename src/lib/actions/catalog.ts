"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, products } from "@/lib/db/schema";
import { assertAdmin, type ActionResult } from "@/lib/auth";
import { productSchema, categorySchema } from "@/lib/validation";

function duplicate(error: unknown) {
  return (
    error instanceof Error &&
    /duplicate key value violates unique constraint|UNIQUE constraint failed/i.test(
      error.message,
    )
  );
}

export async function saveProductAction(input: unknown): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const data = parsed.data;
  const now = new Date();

  try {
    if (data.id) {
      const found = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, data.id))
        .limit(1);
      if (!found[0]) return { ok: false, error: "Produk tidak ditemukan." };
      await db
        .update(products)
        .set({
          name: data.name,
          sku: data.sku.toUpperCase(),
          barcode: data.barcode || null,
          categoryId: data.categoryId,
          price: data.price,
          cost: data.cost,
          stock: data.stock,
          lowStockAt: data.lowStockAt,
          unit: data.unit,
          active: data.active,
          updatedAt: now,
        })
        .where(eq(products.id, data.id));
    } else {
      await db.insert(products).values({
        name: data.name,
        sku: data.sku.toUpperCase(),
        barcode: data.barcode || null,
        categoryId: data.categoryId,
        price: data.price,
        cost: data.cost,
        stock: data.stock,
        lowStockAt: data.lowStockAt,
        unit: data.unit,
        active: data.active,
      });
    }
  } catch (error) {
    if (duplicate(error)) return { ok: false, error: "SKU atau barcode sudah dipakai." };
    throw error;
  }

  revalidatePath("/products");
  revalidatePath("/pos");
  revalidatePath("/inventory");
  return { ok: true };
}

export async function saveCategoryAction(input: unknown): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const data = parsed.data;
  try {
    if (data.id) {
      await db
        .update(categories)
        .set({ name: data.name, color: data.color, sortOrder: data.sortOrder })
        .where(eq(categories.id, data.id));
    } else {
      await db
        .insert(categories)
        .values({ name: data.name, color: data.color, sortOrder: data.sortOrder });
    }
  } catch (error) {
    if (duplicate(error)) return { ok: false, error: "Nama kategori sudah ada." };
    throw error;
  }
  revalidatePath("/products");
  revalidatePath("/pos");
  return { ok: true };
}

export async function deleteCategoryAction(id: number): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Kategori tidak valid." };

  const used = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.categoryId, id))
    .limit(1);
  if (used[0]) return { ok: false, error: "Kategori masih dipakai produk." };

  await db.delete(categories).where(eq(categories.id, id));
  revalidatePath("/products");
  revalidatePath("/pos");
  return { ok: true };
}

export async function toggleProductAction(id: number): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Produk tidak valid." };

  const found = await db
    .select({ active: products.active })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!found[0]) return { ok: false, error: "Produk tidak ditemukan." };

  await db
    .update(products)
    .set({ active: !found[0].active, updatedAt: new Date() })
    .where(eq(products.id, id));
  revalidatePath("/products");
  revalidatePath("/pos");
  return { ok: true };
}