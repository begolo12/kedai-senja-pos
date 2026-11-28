"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { stores, userStores, users } from "@/lib/db/schema";
import { assertSuperAdmin, type ActionResult } from "@/lib/auth";
import { hashPin } from "@/lib/pin";
import { addSubscriptionDuration, computeExtendedExpiry } from "@/lib/subscription";
import { renewSubscriptionSchema, staffSchema } from "@/lib/validation";

function slugifyStoreCode(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
  return base.length >= 2 ? base : "toko";
}

export async function saveStaffAction(input: unknown): Promise<ActionResult> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return auth;

  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const data = parsed.data;

  if (data.id === auth.user.id && (!data.active || data.role !== "admin")) {
    return { ok: false, error: "Tidak bisa menonaktifkan atau menurunkan role akun sendiri." };
  }

  let storeIds = [...new Set(data.storeIds)];
  const willCreateStore = !data.id && data.role !== "admin" && Boolean(data.createStore);

  if (data.role !== "admin" && storeIds.length === 0 && !willCreateStore) {
    return { ok: false, error: "Pilih minimal satu toko atau centang buat toko baru." };
  }
  if (storeIds.length > 0) {
    const allowed = await db
      .select({ id: stores.id })
      .from(stores)
      .where(inArray(stores.id, storeIds));
    if (allowed.length !== storeIds.length) {
      return { ok: false, error: "Ada toko yang tidak valid." };
    }
  }

  try {
    let userId = data.id;
    if (data.id) {
      const found = await db
        .select()
        .from(users)
        .where(eq(users.id, data.id))
        .limit(1);
      const existing = found[0];
      if (!existing) return { ok: false, error: "Staf tidak ditemukan." };
      if (existing.role === "admin" && (data.role !== "admin" || !data.active)) {
        const admins = (
          await db
            .select({ n: sql<string>`count(*)` })
            .from(users)
            .where(sql`${users.role} = 'admin' and ${users.active} = true`)
        )[0]?.n;
        if (Number(admins) <= 1) {
          return { ok: false, error: "Minimal harus ada satu admin aktif." };
        }
      }
      let nextExpiresAt: Date | null | undefined = undefined;
      if (data.role === "admin" || data.durationMode === "unlimited") {
        nextExpiresAt = null;
      } else if (data.durationMode === "custom" && data.durationAmount) {
        nextExpiresAt = addSubscriptionDuration(
          new Date(),
          data.durationAmount,
          data.durationUnit ?? "months",
        );
      }

      await db
        .update(users)
        .set({
          name: data.name,
          username: data.username,
          role: data.role,
          active: data.active,
          subscriptionNote: data.subscriptionNote ?? existing.subscriptionNote,
          ...(nextExpiresAt !== undefined ? { expiresAt: nextExpiresAt } : {}),
          ...(data.pin ? { pinHash: hashPin(data.pin) } : {}),
        })
        .where(eq(users.id, data.id));
    } else {
      if (!data.pin) return { ok: false, error: "PIN / sandi wajib untuk akun baru." };
      if (willCreateStore) {
        const newStoreName = data.storeName?.trim() || data.name;
        const baseCode = slugifyStoreCode(newStoreName);
        const existingCode = await db
          .select({ id: stores.id })
          .from(stores)
          .where(eq(stores.code, baseCode))
          .limit(1);
        const code =
          existingCode.length === 0
            ? baseCode
            : `${baseCode.slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;
        const [createdStore] = await db
          .insert(stores)
          .values({
            name: newStoreName,
            code,
            currency: "IDR",
            serviceChargeRate: 0,
            taxRate: 1100,
            receiptWidth: "80",
            receiptFooter: "Terima kasih.",
            pointsPerAmount: 1_000_000,
            active: true,
          })
          .returning({ id: stores.id });
        storeIds = [...new Set([...storeIds, createdStore.id])];
      }

      const initialExpiresAt =
        data.role === "admin" || data.durationMode === "unlimited"
          ? null
          : addSubscriptionDuration(
              new Date(),
              data.durationAmount ?? 1,
              data.durationUnit ?? "months",
            );

      const [created] = await db
        .insert(users)
        .values({
          name: data.name,
          username: data.username,
          role: data.role,
          active: data.active,
          expiresAt: initialExpiresAt,
          subscriptionNote: data.subscriptionNote ?? "",
          pinHash: hashPin(data.pin),
        })
        .returning({ id: users.id });
      userId = created.id;
    }

    if (userId) {
      await db.delete(userStores).where(eq(userStores.userId, userId));
      if (data.role !== "admin" && storeIds.length > 0) {
        await db
          .insert(userStores)
          .values(storeIds.map((storeId) => ({ userId, storeId })));
      }
    }
  } catch (error) {
    if (
      error instanceof Error &&
      /duplicate key value violates unique constraint/i.test(error.message)
    ) {
      return { ok: false, error: "Username sudah dipakai." };
    }
    throw error;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/stores");
  revalidatePath("/staff");
  revalidatePath("/stores");
  revalidatePath("/select-store");
  return { ok: true };
}

export async function renewSubscriptionAction(
  input: unknown,
): Promise<ActionResult & { expiresAt?: string | null }> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return auth;

  const parsed = renewSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const data = parsed.data;

  const found = await db
    .select()
    .from(users)
    .where(eq(users.id, data.userId))
    .limit(1);
  const target = found[0];
  if (!target) return { ok: false, error: "Akun tidak ditemukan." };
  if (target.role === "admin") {
    return { ok: false, error: "Akun Admin Utama selalu aktif tanpa batas waktu." };
  }

  let nextExpiresAt: Date | null = null;
  if (data.mode === "extend") {
    nextExpiresAt = computeExtendedExpiry(
      target.expiresAt,
      data.amount ?? 1,
      data.unit ?? "months",
    );
  } else if (data.mode === "expire_now") {
    nextExpiresAt = new Date(Date.now() - 1000);
  } else {
    nextExpiresAt = null;
  }

  await db
    .update(users)
    .set({
      expiresAt: nextExpiresAt,
      ...(data.subscriptionNote !== undefined ? { subscriptionNote: data.subscriptionNote } : {}),
      ...(data.reactivate && data.mode !== "expire_now" ? { active: true } : {}),
    })
    .where(eq(users.id, target.id));

  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  revalidatePath("/staff");
  return {
    ok: true,
    expiresAt: nextExpiresAt ? nextExpiresAt.toISOString() : null,
  };
}

export async function toggleStaffAction(id: number): Promise<ActionResult> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return auth;
  if (id === auth.user.id) return { ok: false, error: "Tidak bisa menonaktifkan akun sendiri." };

  const found = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const target = found[0];
  if (!target) return { ok: false, error: "Staf tidak ditemukan." };

  if (target.role === "admin" && target.active) {
    const admins = (
      await db
        .select({ n: sql<string>`count(*)` })
        .from(users)
        .where(sql`${users.role} = 'admin' and ${users.active} = true`)
    )[0]?.n;
    if (Number(admins) <= 1) return { ok: false, error: "Minimal harus ada satu admin aktif." };
  }

  await db.update(users).set({ active: !target.active }).where(eq(users.id, id));
  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  revalidatePath("/staff");
  return { ok: true };
}