"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, products } from "@/lib/db/schema";
import { assertAdmin, type ActionResult } from "@/lib/auth";
import { productSchema, categorySchema } from "@/lib/validation";
import { parseCsv } from "@/lib/csv";
import { parseMoneyInput } from "@/lib/money";

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
          options: data.options || null,
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
        options: data.options || null,
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
export async function importMenuAction(csv: string): Promise<ActionResult & { created?: number; updated?: number }> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  if (typeof csv !== "string" || csv.length > 80_000) {
    return { ok: false, error: "CSV terlalu besar." };
  }

  const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  if (rows.length === 0) return { ok: false, error: "CSV kosong." };

  const header = rows[0].map((cell) => cell.toLowerCase());
  const start = header[0]?.includes("nama") ? 1 : 0;
  if (rows.length - start > 500) return { ok: false, error: "Maksimal 500 baris." };

  const existingCategories = await db.select().from(categories);
  const categoryMap = new Map(existingCategories.map((category) => [category.name.toLowerCase(), category.id]));
  const palette = ["#a2542a", "#6b7a4f", "#8c4a3c", "#b07b3a", "#4f5b66", "#7a5c8c"];
  const existingProducts = await db.select({ id: products.id, name: products.name, sku: products.sku }).from(products);
  const byName = new Map(existingProducts.map((product) => [product.name.toLowerCase(), product]));
  const usedSku = new Set(existingProducts.map((product) => product.sku));

  let created = 0;
  let updated = 0;
  for (let index = start; index < rows.length; index++) {
    const [name, categoryName, priceRaw, costRaw, stockRaw, unitRaw, optionsRaw] = rows[index];
    if (!name || !priceRaw) continue;

    const price = parseMoneyInput(priceRaw);
    const cost = costRaw ? parseMoneyInput(costRaw) : 0;
    const stock = Math.max(0, Number(stockRaw || 0));
    const unit = unitRaw || "porsi";
    const options = optionsRaw ? optionsRaw.replaceAll(";", ",") : null;

    let categoryId: number | null = null;
    if (categoryName) {
      const key = categoryName.toLowerCase();
      categoryId = categoryMap.get(key) ?? null;
      if (!categoryId) {
        const [inserted] = await db
          .insert(categories)
          .values({
            name: categoryName,
            color: palette[categoryMap.size % palette.length],
            sortOrder: categoryMap.size + 1,
          })
          .returning({ id: categories.id });
        categoryId = inserted.id;
        categoryMap.set(key, categoryId);
      }
    }

    const existing = byName.get(name.toLowerCase());
    if (existing) {
      await db
        .update(products)
        .set({
          name,
          categoryId,
          price,
          cost,
          stock,
          unit,
          options,
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(products.id, existing.id));
      updated++;
      continue;
    }

    const base = `MNU-${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 12) || "ITEM"}`;
    let sku = base;
    let suffix = 2;
    while (usedSku.has(sku)) sku = `${base}-${suffix++}`;
    usedSku.add(sku);

    await db.insert(products).values({
      name,
      sku,
      categoryId,
      price,
      cost,
      stock,
      lowStockAt: 5,
      unit,
      options,
      active: true,
    });
    byName.set(name.toLowerCase(), { id: 0, name, sku });
    created++;
  }

  if (created + updated === 0) return { ok: false, error: "Tidak ada baris valid." };
  revalidatePath("/products");
  revalidatePath("/pos");
  return { ok: true, created, updated };
}
