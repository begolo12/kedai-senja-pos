"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, stockMovements } from "@/lib/db/schema";
import { assertAdmin, type ActionResult } from "@/lib/auth";
import { stockAdjustSchema } from "@/lib/validation";

export async function adjustStockAction(input: unknown): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;

  const parsed = stockAdjustSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const { productId, delta, reason, note } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const found = await tx
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    const product = found[0];
    if (!product) return { ok: false as const, error: "Produk tidak ditemukan." };
    if (product.stock + delta < 0) {
      return { ok: false as const, error: `Stok ${product.name} tidak boleh minus.` };
    }
    const now = new Date();
    await tx
      .update(products)
      .set({ stock: sql`${products.stock} + ${delta}`, updatedAt: now })
      .where(eq(products.id, productId));
    await tx.insert(stockMovements).values({
      productId,
      delta,
      reason,
      refType: "manual",
      userId: auth.user.id,
      note: note || null,
      createdAt: now,
    });
    return { ok: true as const };
  });

  if (result.ok) {
    revalidatePath("/inventory");
    revalidatePath("/products");
    revalidatePath("/pos");
  }
  return result;
}