import { and, eq, inArray, sql } from "drizzle-orm";
import { products, recipeItems, stockMovements } from "./db/schema";
import type { Product } from "./db/schema";

type Tx = Parameters<Parameters<typeof import("./db").db.transaction>[0]>[0];

export type RecipeRow = { ingredientId: number; qty: number };

/** Resep per produk: kosong berarti stok produk sendiri yang dipotong. */
export async function loadRecipes(tx: Tx, productIds: number[]): Promise<Map<number, RecipeRow[]>> {
  const map = new Map<number, RecipeRow[]>();
  if (productIds.length === 0) return map;
  const rows = await tx
    .select()
    .from(recipeItems)
    .where(inArray(recipeItems.productId, productIds));
  for (const row of rows) {
    const list = map.get(row.productId) ?? [];
    list.push({ ingredientId: row.ingredientId, qty: row.qty });
    map.set(row.productId, list);
  }
  return map;
}

type SaleLine = { product: Product; qty: number };

/**
 * Potong stok untuk penjualan: produk berresep memotong stok bahan,
 * produk tanpa resep memotong stoknya sendiri. Validasi stok bahan ada
 * di sini supaya kasir, self-order, dan sync offline berperilaku sama.
 */
export async function deductForSale(
  tx: Tx,
  opts: {
    storeId: number;
    userId: number | null;
    orderId: number;
    lines: SaleLine[];
    createdAt: Date;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const recipes = await loadRecipes(
    tx,
    opts.lines.map((line) => line.product.id),
  );
  const need = new Map<number, number>();
  const via = new Map<number, string>();
  for (const line of opts.lines) {
    const recipe = recipes.get(line.product.id);
    if (recipe && recipe.length > 0) {
      for (const row of recipe) {
        need.set(row.ingredientId, (need.get(row.ingredientId) ?? 0) + row.qty * line.qty);
        if (!via.has(row.ingredientId)) via.set(row.ingredientId, line.product.name);
      }
    } else {
      need.set(line.product.id, (need.get(line.product.id) ?? 0) + line.qty);
    }
  }

  const targets: Product[] = [];
  for (const id of need.keys()) {
    const found = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.storeId, opts.storeId)))
      .for("update");
    if (!found[0]) return { ok: false, error: "Produk/bahan tidak ditemukan." };
    targets.push(found[0]);
  }
  for (const target of targets) {
    const qty = need.get(target.id) ?? 0;
    if (target.stock < qty) {
      const source = via.get(target.id);
      return {
        ok: false,
        error: source
          ? `Stok bahan ${target.name} (untuk ${source}) tinggal ${target.stock}.`
          : `Stok ${target.name} tinggal ${target.stock}.`,
      };
    }
  }
  for (const target of targets) {
    const qty = need.get(target.id) ?? 0;
    if (qty === 0) continue;
    await tx
      .update(products)
      .set({ stock: sql`${products.stock} - ${qty}`, updatedAt: opts.createdAt })
      .where(and(eq(products.id, target.id), eq(products.storeId, opts.storeId)));
    await tx.insert(stockMovements).values({
      storeId: opts.storeId,
      productId: target.id,
      delta: -qty,
      reason: "sale",
      refType: "order",
      refId: opts.orderId,
      userId: opts.userId,
      note: via.get(target.id) ?? null,
      createdAt: opts.createdAt,
    });
  }
  return { ok: true };
}

/** Refund: kembalikan stok mengikuti resep yang sama. */
export async function restoreForRefund(
  tx: Tx,
  opts: {
    storeId: number;
    userId: number;
    orderId: number;
    items: { productId: number | null; name: string; qty: number }[];
    reason: string;
    createdAt: Date;
  },
): Promise<void> {
  const known = opts.items
    .map((item) => item.productId)
    .filter((id): id is number => id !== null);
  const recipes = await loadRecipes(tx, known);
  const give = new Map<number, number>();
  const via = new Map<number, string>();
  for (const item of opts.items) {
    if (!item.productId) continue;
    const recipe = recipes.get(item.productId);
    if (recipe && recipe.length > 0) {
      for (const row of recipe) {
        give.set(row.ingredientId, (give.get(row.ingredientId) ?? 0) + row.qty * item.qty);
        if (!via.has(row.ingredientId)) via.set(row.ingredientId, item.name);
      }
    } else {
      give.set(item.productId, (give.get(item.productId) ?? 0) + item.qty);
    }
  }
  for (const [id, qty] of give) {
    await tx
      .update(products)
      .set({ stock: sql`${products.stock} + ${qty}`, updatedAt: opts.createdAt })
      .where(and(eq(products.id, id), eq(products.storeId, opts.storeId)));
    await tx.insert(stockMovements).values({
      storeId: opts.storeId,
      productId: id,
      delta: qty,
      reason: "refund",
      refType: "order",
      refId: opts.orderId,
      userId: opts.userId,
      note: via.get(id) ? `${opts.reason} (${via.get(id)})` : opts.reason,
      createdAt: opts.createdAt,
    });
  }
}
