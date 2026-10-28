import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { customers, tiers, type Tier } from "./db/schema";

/**
 * Tier pelanggan: tier aktif dengan ambang totalSpent tertinggi yang sudah
 * dilampaui. Tanpa tier → multiplier 100 (poin normal).
 */
export async function resolveTier(
  storeId: number,
  totalSpent: number,
): Promise<Tier | null> {
  const rows = await db
    .select()
    .from(tiers)
    .where(and(eq(tiers.storeId, storeId), eq(tiers.active, true)))
    .orderBy(desc(tiers.minTotalSpent));
  return rows.find((tier) => totalSpent >= tier.minTotalSpent) ?? null;
}

export async function tierForCustomer(customerId: number): Promise<Tier | null> {
  const found = await db
    .select({ totalSpent: customers.totalSpent, storeId: customers.storeId })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  const row = found[0];
  if (!row) return null;
  return resolveTier(row.storeId, row.totalSpent);
}

export function pointsWithMultiplier(base: number, multiplier: number): number {
  return Math.floor((base * Math.max(50, multiplier)) / 100);
}
