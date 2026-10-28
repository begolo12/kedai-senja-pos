"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vouchers } from "@/lib/db/schema";
import { assertAdmin, type ActionResult } from "@/lib/auth";
import { voucherSchema } from "@/lib/validation";

/** "YYYY-MM-DD" → awal hari lokal; kosong → null. */
function parseDayStart(input: string): Date | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "YYYY-MM-DD" → akhir hari (23:59:59.999) lokal; kosong → null. */
function parseDayEnd(input: string): Date | null {
  const start = parseDayStart(input);
  if (!start) return null;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export async function saveVoucherAction(input: unknown): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  const { store } = auth;

  const parsed = voucherSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const data = parsed.data;

  if (data.type === "percent" && data.value > 100) {
    return { ok: false, error: "Diskon persen maksimal 100." };
  }

  const startsAt = parseDayStart(data.startsAt ?? "");
  const endsAt = parseDayEnd(data.endsAt ?? "");
  if (startsAt && endsAt && endsAt < startsAt) {
    return { ok: false, error: "Tanggal selesai sebelum mulai." };
  }

  const clash = await db
    .select({ id: vouchers.id })
    .from(vouchers)
    .where(and(eq(vouchers.storeId, store.id), eq(vouchers.code, data.code)))
    .limit(1);
  if (clash[0] && clash[0].id !== data.id) {
    return { ok: false, error: `Kode ${data.code} sudah dipakai voucher lain.` };
  }

  if (data.id) {
    const found = await db
      .select({ id: vouchers.id })
      .from(vouchers)
      .where(and(eq(vouchers.id, data.id), eq(vouchers.storeId, store.id)))
      .limit(1);
    if (!found[0]) return { ok: false, error: "Voucher tidak ditemukan." };
    await db
      .update(vouchers)
      .set({
        code: data.code,
        label: data.label,
        type: data.type,
        value: data.value,
        minSubtotal: data.minSubtotal,
        startsAt,
        endsAt,
        usageLimit: data.usageLimit,
        active: data.active,
      })
      .where(and(eq(vouchers.id, data.id), eq(vouchers.storeId, store.id)));
  } else {
    await db.insert(vouchers).values({
      storeId: store.id,
      code: data.code,
      label: data.label,
      type: data.type,
      value: data.value,
      minSubtotal: data.minSubtotal,
      startsAt,
      endsAt,
      usageLimit: data.usageLimit,
      active: data.active,
    });
  }

  revalidatePath("/vouchers");
  return { ok: true };
}

export async function toggleVoucherAction(id: number): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  const { store } = auth;
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Voucher tidak valid." };
  }

  const found = await db
    .select({ active: vouchers.active })
    .from(vouchers)
    .where(and(eq(vouchers.id, id), eq(vouchers.storeId, store.id)))
    .limit(1);
  const current = found[0];
  if (!current) return { ok: false, error: "Voucher tidak ditemukan." };

  await db
    .update(vouchers)
    .set({ active: !current.active })
    .where(and(eq(vouchers.id, id), eq(vouchers.storeId, store.id)));

  revalidatePath("/vouchers");
  return { ok: true };
}
