"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPin } from "@/lib/pin";
import { clearSession, writePending } from "@/lib/session";
import { loginSchema } from "@/lib/validation";

export type LoginState = { error?: string; username?: string };

// ponytail: per-process throttle. Move to a shared store if this ever runs multi-instance.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 6;

function throttled(key: string, now = Date.now()) {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string, now = Date.now()) {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
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

  if (throttled(username)) {
    return { error: "Terlalu banyak percobaan. Tunggu 5 menit." };
  }

  const found = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  const user = found[0];
  if (!user || !user.active || !verifyPin(pin, user.pinHash)) {
    recordFailure(username);
    return { error: "Username atau PIN salah.", username };
  }

  attempts.delete(username);
  await writePending(user.id);
  redirect("/select-store");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}