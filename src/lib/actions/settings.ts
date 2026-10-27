"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { assertAdmin, type ActionResult } from "@/lib/auth";
import { settingsSchema } from "@/lib/validation";

export async function updateSettingsAction(input: unknown): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }

  await db
    .update(settings)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(settings.id, 1));

  revalidatePath("/settings");
  revalidatePath("/pos");
  revalidatePath("/");
  return { ok: true };
}
