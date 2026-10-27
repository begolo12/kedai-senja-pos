import { cache } from "react";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import {
  stores,
  userStores,
  users,
  type Store,
  type User,
} from "./db/schema";
import { readSession } from "./session";

export type StoreContext = { user: User; store: Store };

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await readSession();
  if (!session) return null;
  const found = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const user = found[0];
  if (!user || !user.active) return null;
  return user;
});

export async function getAllowedStores(user: User): Promise<Store[]> {
  if (user.role === "admin") {
    return db
      .select()
      .from(stores)
      .where(eq(stores.active, true))
      .orderBy(asc(stores.name));
  }
  return db
    .select({ store: stores })
    .from(userStores)
    .innerJoin(stores, eq(userStores.storeId, stores.id))
    .where(and(eq(userStores.userId, user.id), eq(stores.active, true)))
    .orderBy(asc(stores.name))
    .then((rows) => rows.map((row) => row.store));
}

export async function userCanUseStore(user: User, storeId: number) {
  if (user.role === "admin") {
    const found = await db
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, storeId), eq(stores.active, true)))
      .limit(1);
    return Boolean(found[0]);
  }
  const found = await db
    .select({ storeId: userStores.storeId })
    .from(userStores)
    .innerJoin(stores, eq(userStores.storeId, stores.id))
    .where(
      and(
        eq(userStores.userId, user.id),
        eq(userStores.storeId, storeId),
        eq(stores.active, true),
      ),
    )
    .limit(1);
  return Boolean(found[0]);
}

export const getStoreContext = cache(async (): Promise<{
  user: User;
  store: Store | null;
} | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const session = await readSession();
  if (!session) return null;
  if (!session.storeId) return { user, store: null };
  const found = await db
    .select()
    .from(stores)
    .where(and(eq(stores.id, session.storeId), eq(stores.active, true)))
    .limit(1);
  const store = found[0];
  if (!store) return { user, store: null };
  if (!(await userCanUseStore(user, store.id))) return { user, store: null };
  return { user, store };
});

export async function requireStore(): Promise<StoreContext> {
  const context = await getStoreContext();
  if (!context) redirect("/login");
  if (!context.store) redirect("/select-store");
  return { user: context.user, store: context.store };
}

export async function requireAdmin(): Promise<StoreContext> {
  const context = await requireStore();
  if (context.user.role !== "admin") redirect("/pos");
  return context;
}

/** For server actions: never redirect, return a typed failure instead. */
export async function assertStore(): Promise<
  { ok: true; user: User; store: Store } | { ok: false; error: string }
> {
  const context = await getStoreContext();
  if (!context) return { ok: false, error: "Sesi berakhir. Masuk ulang." };
  if (!context.store) {
    return { ok: false, error: "Pilih toko dulu. Muat ulang halaman." };
  }
  return { ok: true, user: context.user, store: context.store };
}

export async function assertAdmin(): Promise<
  { ok: true; user: User; store: Store } | { ok: false; error: string }
> {
  const context = await assertStore();
  if (!context.ok) return context;
  if (context.user.role !== "admin") {
    return { ok: false, error: "Hanya manajemen yang boleh melakukan ini." };
  }
  return context;
}

export type ActionResult = { ok: true } | { ok: false; error: string };