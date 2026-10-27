import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users, type User } from "./db/schema";
import { readSession } from "./session";

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

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/pos");
  return user;
}

/** For server actions: never redirect, return a typed failure instead. */
export async function assertAdmin(): Promise<
  { ok: true; user: User } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sesi berakhir. Masuk ulang." };
  if (user.role !== "admin") {
    return { ok: false, error: "Hanya admin yang boleh melakukan ini." };
  }
  return { ok: true, user };
}

export type ActionResult = { ok: true } | { ok: false; error: string };