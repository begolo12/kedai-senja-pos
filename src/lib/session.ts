import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { cookies } from "next/headers";
import { connection } from "next/server";

const COOKIE = "pos_session";
const PENDING_COOKIE = "pos_pending";
const TTL_MS = 12 * 60 * 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000;
const API_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET wajib diisi (minimal 16 karakter) di production.");
  }
  return "dev-only-secret-change-me";
}

function sign(data: string) {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

function token(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

const payloadSchema = z.object({
  uid: z.number().int().positive().optional(),
  sid: z.number().int().positive().optional(),
  exp: z.number().int().positive(),
  scope: z.string(),
});

function verify(value: string | undefined, scope: string, now = 0) {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  const checkedAt = now || Date.now();
  try {
    const parsed = payloadSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString()),
    );
    if (!parsed.success || parsed.data.scope !== scope || parsed.data.exp < checkedAt) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function createSessionToken(userId: number, storeId: number, now = Date.now()) {
  return token({ uid: userId, sid: storeId, exp: now + TTL_MS, scope: "session" });
}

export function readSessionToken(value: string | undefined, now = 0) {
  const data = verify(value, "session", now);
  if (!data?.uid || !data.sid) return null;
  return { userId: data.uid, storeId: data.sid };
}

export function createPendingToken(userId: number, now = Date.now()) {
  return token({ uid: userId, exp: now + PENDING_TTL_MS, scope: "pending" });
}

export function readPendingToken(value: string | undefined, now = 0) {
  const data = verify(value, "pending", now);
  if (!data?.uid) return null;
  return { userId: data.uid };
}

export function createApiToken(userId: number, storeId: number, now = Date.now()) {
  return token({ uid: userId, sid: storeId, exp: now + API_TTL_MS, scope: "mobile" });
}

export function readApiToken(value: string | undefined, now = 0) {
  const data = verify(value, "mobile", now);
  if (!data?.uid || !data.sid) return null;
  return { userId: data.uid, storeId: data.sid };
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "0",
  path: "/",
};

export async function writeSession(userId: number, storeId: number) {
  const store = await cookies();
  store.set(COOKIE, createSessionToken(userId, storeId), {
    ...cookieOptions,
    maxAge: TTL_MS / 1000,
  });
  store.delete(PENDING_COOKIE);
}

export async function writePending(userId: number) {
  const store = await cookies();
  store.set(PENDING_COOKIE, createPendingToken(userId), {
    ...cookieOptions,
    maxAge: PENDING_TTL_MS / 1000,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE);
  store.delete(PENDING_COOKIE);
}

export async function readSession() {
  await connection();
  const store = await cookies();
  return readSessionToken(store.get(COOKIE)?.value);
}

export async function readPending() {
  await connection();
  const store = await cookies();
  return readPendingToken(store.get(PENDING_COOKIE)?.value);
}