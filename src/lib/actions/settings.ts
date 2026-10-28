"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { stores } from "@/lib/db/schema";
import { assertAdmin, type ActionResult } from "@/lib/auth";
import { settingsSchema } from "@/lib/validation";

export async function updateSettingsAction(input: unknown): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const data = parsed.data;

  await db
    .update(stores)
    .set({
      name: data.storeName,
      address: data.address,
      phone: data.phone,
      taxRate: data.taxRate,
      receiptWidth: data.receiptWidth,
      qrisPayload: data.qrisPayload,
      receiptFooter: data.receiptFooter,
      pointsPerAmount: data.pointsPerAmount,
      pointsValue: data.pointsValue,
    })
    .where(eq(stores.id, auth.store.id));

  revalidatePath("/settings");
  revalidatePath("/pos");
  revalidatePath("/");
  revalidatePath("/select-store");
  return { ok: true };
}
