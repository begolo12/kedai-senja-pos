"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { assertAdmin, type ActionResult } from "@/lib/auth";
import { customerSchema } from "@/lib/validation";

export async function saveCustomerAction(input: unknown): Promise<ActionResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const data = parsed.data;
  const phone = data.phone?.trim() || null;
  const email = data.email?.trim() || null;

  try {
    if (data.id) {
      const found = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, data.id))
        .limit(1);
      if (!found[0]) return { ok: false, error: "Pelanggan tidak ditemukan." };
      await db
        .update(customers)
        .set({ name: data.name, phone, email })
        .where(eq(customers.id, data.id));
    } else {
      await db.insert(customers).values({ name: data.name, phone, email });
    }
  } catch (error) {
    if (
      error instanceof Error &&
      /duplicate key value violates unique constraint/i.test(error.message)
    ) {
      return { ok: false, error: "Nomor telepon sudah terdaftar." };
    }
    throw error;
  }

  revalidatePath("/customers");
  return { ok: true };
}