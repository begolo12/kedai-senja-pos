"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tiers } from "@/lib/db/schema";
import { assertAdmin, type ActionResult } from "@/lib/auth";
import { tierSchema } from "@/lib/validation";

export async function saveTierAction(input: unknown): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  const { store } = auth;

  const parsed = tierSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const data = parsed.data;

  const clash = await db
    .select({ id: tiers.id })
    .from(tiers)
    .where(and(eq(tiers.storeId, store.id), eq(tiers.name, data.name)))
    .limit(1);
  if (clash[0] && clash[0].id !== data.id) {
    return { ok: false, error: `Tier ${data.name} sudah ada.` };
  }

  if (data.id) {
    const found = await db
      .select({ id: tiers.id })
      .from(tiers)
      .where(and(eq(tiers.id, data.id), eq(tiers.storeId, store.id)))
      .limit(1);
    if (!found[0]) return { ok: false, error: "Tier tidak ditemukan." };
    await db
      .update(tiers)
      .set({
        name: data.name,
        minTotalSpent: data.minTotalSpent,
        pointsMultiplier: data.pointsMultiplier,
        perks: data.perks || "",
        active: data.active,
      })
      .where(and(eq(tiers.id, data.id), eq(tiers.storeId, store.id)));
  } else {
    await db.insert(tiers).values({
      storeId: store.id,
      name: data.name,
      minTotalSpent: data.minTotalSpent,
      pointsMultiplier: data.pointsMultiplier,
      perks: data.perks || "",
      active: data.active,
    });
  }

  revalidatePath("/tiers");
  revalidatePath("/customers");
  return { ok: true };
}

export async function toggleTierAction(id: number): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  const { store } = auth;
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Tier tidak valid." };
  }

  const found = await db
    .select({ active: tiers.active })
    .from(tiers)
    .where(and(eq(tiers.id, id), eq(tiers.storeId, store.id)))
    .limit(1);
  const current = found[0];
  if (!current) return { ok: false, error: "Tier tidak ditemukan." };

  await db
    .update(tiers)
    .set({ active: !current.active })
    .where(and(eq(tiers.id, id), eq(tiers.storeId, store.id)));

  revalidatePath("/tiers");
  revalidatePath("/customers");
  return { ok: true };
}
