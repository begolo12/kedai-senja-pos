"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { shifts } from "@/lib/db/schema";
import { assertStore, type ActionResult } from "@/lib/auth";
import { getOpenShift, getShiftSummary } from "@/lib/shifts";
import { shiftCloseSchema, shiftOpenSchema } from "@/lib/validation";

export async function openShiftAction(input: unknown): Promise<ActionResult> {
  const auth = await assertStore();
  if (!auth.ok) return auth;

  const parsed = shiftOpenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  if (await getOpenShift(auth.user.id, auth.store.id)) {
    return { ok: false, error: "Masih ada shift terbuka di toko ini." };
  }

  await db.insert(shifts).values({
    userId: auth.user.id,
    storeId: auth.store.id,
    openingFloat: parsed.data.openingFloat,
  });
  revalidatePath("/shift");
  revalidatePath("/pos");
  return { ok: true };
}

export async function closeShiftAction(input: unknown): Promise<ActionResult> {
  const auth = await assertStore();
  if (!auth.ok) return auth;

  const parsed = shiftCloseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }

  const shift = await getOpenShift(auth.user.id, auth.store.id);
  if (!shift) return { ok: false, error: "Tidak ada shift terbuka." };

  const summary = await getShiftSummary(shift.id, auth.store.id);
  const expectedCash = shift.openingFloat + summary.cashIn - summary.cashRefundOut;
  await db
    .update(shifts)
    .set({
      status: "closed",
      closedAt: new Date(),
      countedCash: parsed.data.checkedCash,
      expectedCash,
      note: parsed.data.note || null,
    })
    .where(eq(shifts.id, shift.id));

  revalidatePath("/shift");
  revalidatePath("/pos");
  return { ok: true };
}
