"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { assertStore, type ActionResult } from "@/lib/auth";

const ALLOWED = ["preparing", "ready", "served"] as const;
export type KitchenStatus = (typeof ALLOWED)[number];

export async function setKitchenStatusAction(
  orderId: number,
  status: string,
): Promise<ActionResult> {
  const auth = await assertStore();
  if (!auth.ok) return auth;
  const { store } = auth;
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "Pesanan tidak valid." };
  }
  if (!ALLOWED.includes(status as KitchenStatus)) {
    return { ok: false, error: "Status dapur tidak valid." };
  }

  const found = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.storeId, store.id)))
    .limit(1);
  if (!found[0]) return { ok: false, error: "Pesanan tidak ditemukan." };

  await db
    .update(orders)
    .set({ kitchenStatus: status as KitchenStatus })
    .where(and(eq(orders.id, orderId), eq(orders.storeId, store.id)));

  revalidatePath("/kds");
  revalidatePath("/orders");
  return { ok: true };
}
