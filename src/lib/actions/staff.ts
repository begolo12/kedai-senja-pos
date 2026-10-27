"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { assertAdmin, type ActionResult } from "@/lib/auth";
import { hashPin } from "@/lib/pin";
import { staffSchema } from "@/lib/validation";

export async function saveStaffAction(input: unknown): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;

  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const data = parsed.data;

  if (data.id === auth.user.id && (!data.active || data.role !== "admin")) {
    return { ok: false, error: "Tidak bisa menonaktifkan atau menurunkan role akun sendiri." };
  }

  try {
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
      await db
        .update(users)
        .set({
          name: data.name,
          username: data.username,
          role: data.role,
          active: data.active,
          ...(data.pin ? { pinHash: hashPin(data.pin) } : {}),
        })
        .where(eq(users.id, data.id));
    } else {
      if (!data.pin) return { ok: false, error: "PIN wajib untuk staf baru." };
      await db.insert(users).values({
        name: data.name,
        username: data.username,
        role: data.role,
        active: data.active,
        pinHash: hashPin(data.pin),
      });
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

  revalidatePath("/staff");
  return { ok: true };
}

export async function toggleStaffAction(id: number): Promise<ActionResult> {
  const auth = await assertAdmin();
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
  revalidatePath("/staff");
  return { ok: true };
}