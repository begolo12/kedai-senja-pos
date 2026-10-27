"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, shifts } from "@/lib/db/schema";
import { getCurrentUser, type ActionResult } from "@/lib/auth";
import { getOpenShift } from "@/lib/shifts";
import { shiftCloseSchema, shiftOpenSchema } from "@/lib/validation";

export async function openShiftAction(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sesi berakhir. Masuk ulang." };

  const parsed = shiftOpenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  if (await getOpenShift(user.id)) return { ok: false, error: "Masih ada shift terbuka." };

  await db
    .insert(shifts)
    .values({ userId: user.id, openingFloat: parsed.data.openingFloat });
  revalidatePath("/shift");
  revalidatePath("/pos");
  return { ok: true };
}

export async function closeShiftAction(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sesi berakhir. Masuk ulang." };

  const parsed = shiftCloseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }

  const shift = await getOpenShift(user.id);
  if (!shift) return { ok: false, error: "Tidak ada shift terbuka." };

  const cash = (
    await db
      .select({ total: sql<string>`coalesce(sum(${orders.total}), 0)` })
      .from(orders)
      .where(
        and(
          eq(orders.shiftId, shift.id),
          eq(orders.status, "completed"),
          eq(orders.paymentMethod, "cash"),
        ),
      )
  )[0]?.total;

  const expectedCash = shift.openingFloat + Number(cash ?? 0);
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
