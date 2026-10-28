"use server";

import { redirect } from "next/navigation";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginAttempts, users } from "@/lib/db/schema";
import { verifyPin } from "@/lib/pin";
import { clearSession, writePending } from "@/lib/session";
import { loginSchema } from "@/lib/validation";

export type LoginState = { error?: string; username?: string };

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 6;

// Cache per-process; login_attempts adalah sumber kebenaran lintas instance.
const attempts = new Map<string, { count: number; resetAt: number }>();

async function recentFailures(username: string, now: number): Promise<number> {
  const since = new Date(now - WINDOW_MS);
  const row = await db
    .select({ n: sql<string>`count(*)` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.username, username),
        eq(loginAttempts.success, false),
        gte(loginAttempts.createdAt, since),
      ),
    );
  return Number(row[0]?.n ?? 0);
}

async function recordFailure(username: string, now: number) {
  await db.insert(loginAttempts).values({ username, success: false, createdAt: new Date(now) });
  // Housekeeping: gagal login lebih dari sejam tidak relevan lagi.
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(now - 60 * 60 * 1000)));
  const entry = attempts.get(username);
  if (!entry || entry.resetAt < now) {
    attempts.set(username, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const raw = {
    username: String(formData.get("username") ?? "").toLowerCase(),
    pin: String(formData.get("pin") ?? ""),
  };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const { username, pin } = parsed.data;
  const now = Date.now();

  const cached = attempts.get(username);
  if (cached && cached.resetAt >= now && cached.count >= MAX_ATTEMPTS) {
    return { error: "Terlalu banyak percobaan. Tunggu 5 menit." };
  }

  const found = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  const user = found[0];
  if (!user || !user.active || !verifyPin(pin, user.pinHash)) {
    const failures = await recentFailures(username, now).catch(() => 0);
    await recordFailure(username, now).catch(() => undefined);
    if (failures + 1 >= MAX_ATTEMPTS) {
      attempts.set(username, { count: failures + 1, resetAt: now + WINDOW_MS });
      return { error: "Terlalu banyak percobaan. Tunggu 5 menit.", username };
    }
    return { error: "Username atau PIN salah.", username };
  }

  attempts.delete(username);
  await db
    .insert(loginAttempts)
    .values({ username, success: true, createdAt: new Date(now) })
    .catch(() => undefined);
  await writePending(user.id);
  redirect("/select-store");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}