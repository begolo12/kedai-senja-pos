"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, products, stores, userStores, users } from "@/lib/db/schema";
import { defaultRouteForRole, getCurrentUser, isManager, userCanUseStore } from "@/lib/auth";
import { readPending, readSession, writeSession } from "@/lib/session";
import { isUserExpired } from "@/lib/subscription";
import { storeSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/auth";
import type { Store } from "@/lib/db/schema";

async function resolveLoginUser() {
  const pending = await readPending();
  if (pending) {
    const found = await db
      .select()
      .from(users)
      .where(eq(users.id, pending.userId))
      .limit(1);
    const u = found[0];
    return u && u.active && !isUserExpired(u) ? u : null;
  }
  return getCurrentUser();
}

export async function chooseStoreAction(formData: FormData) {
  const storeId = Number(formData.get("storeId"));
  const fallback = "/select-store";
  if (!Number.isInteger(storeId) || storeId <= 0) redirect(`${fallback}?error=1`);

  const user = await resolveLoginUser();
  if (!user) redirect("/login");
  if (!(await userCanUseStore(user, storeId))) redirect(`${fallback}?error=1`);

  await writeSession(user.id, storeId);
  redirect(defaultRouteForRole(user.role));
}

export async function saveStoreAction(
  input: unknown,
): Promise<ActionResult & { store?: Store }> {
  const pending = await getCurrentUser();
  if (!pending) return { ok: false, error: "Sesi berakhir. Masuk ulang." };
  if (!isManager(pending.role)) {
    return { ok: false, error: "Hanya manajemen yang boleh mengelola toko." };
  }
  if (pending.username === "demo") {
    return { ok: false, error: "Akun demo tidak dapat menambah atau mengubah pengaturan cabang." };
  }
  const current = await readSession();
  if (!current) return { ok: false, error: "Sesi berakhir. Masuk ulang." };

  const parsed = storeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const data = parsed.data;
  const now = new Date();

  try {
    if (data.id) {
      const found = await db
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.id, data.id))
        .limit(1);
      if (!found[0]) return { ok: false, error: "Toko tidak ditemukan." };
      if (pending.role !== "admin") {
        const owns = await userCanUseStore(pending, data.id);
        if (!owns) return { ok: false, error: "Toko tidak tersedia untuk akun ini." };
      }
      if (current.storeId && data.id === current.storeId && !data.active) {
        return { ok: false, error: "Tidak bisa menonaktifkan toko yang sedang dipakai." };
      }
      const [updated] = await db
        .update(stores)
        .set({
          name: data.name,
          code: data.code.toLowerCase(),
          address: data.address,
          phone: data.phone,
          taxRate: data.taxRate,
          receiptWidth: data.receiptWidth,
          active: data.active,
        })
        .where(eq(stores.id, data.id))
        .returning();
      revalidatePath("/admin");
      revalidatePath("/admin/stores");
      revalidatePath("/stores");
      revalidatePath("/select-store");
      revalidatePath("/");
      return { ok: true, store: updated };
    }

    const [created] = await db
      .insert(stores)
      .values({
        name: data.name,
        code: data.code.toLowerCase(),
        address: data.address,
        phone: data.phone,
        taxRate: data.taxRate,
        receiptWidth: data.receiptWidth,
        active: true,
        createdAt: now,
      })
      .returning();

    if (pending.role === "owner") {
      await db
        .insert(userStores)
        .values({ userId: pending.id, storeId: created.id })
        .onConflictDoNothing();
    }

    if (data.copyMenu && current.storeId) {
      const sourceCategories = await db
        .select()
        .from(categories)
        .where(eq(categories.storeId, current.storeId));
      const categoryMap = new Map<number, number>();
      for (const category of sourceCategories) {
        const [copy] = await db
          .insert(categories)
          .values({
            storeId: created.id,
            name: category.name,
            color: category.color,
            sortOrder: category.sortOrder,
          })
          .returning({ id: categories.id });
        categoryMap.set(category.id, copy.id);
      }
      const sourceProducts = await db
        .select()
        .from(products)
        .where(eq(products.storeId, current.storeId));
      if (sourceProducts.length > 0) {
        await db.insert(products).values(
          sourceProducts.map((product) => ({
            storeId: created.id,
            sku: product.sku,
            barcode: product.barcode,
            name: product.name,
            categoryId: product.categoryId ? categoryMap.get(product.categoryId) ?? null : null,
            price: product.price,
            cost: product.cost,
            stock: product.stock,
            lowStockAt: product.lowStockAt,
            unit: product.unit,
            options: product.options,
            active: product.active,
          })),
        );
      }
    }

    revalidatePath("/admin");
    revalidatePath("/admin/stores");
    revalidatePath("/stores");
    revalidatePath("/select-store");
    return { ok: true, store: created };
  } catch (error) {
    if (
      error instanceof Error &&
      /duplicate key value violates unique constraint/i.test(error.message)
    ) {
      return { ok: false, error: "Kode toko sudah dipakai." };
    }
    throw error;
  }
}
