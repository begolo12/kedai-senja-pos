import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";

const COOKIE = "pos_session";
const TTL_MS = 12 * 60 * 60 * 1000;
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

export function createSessionToken(userId: number, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: now + TTL_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined, now = 0) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  // Read the clock only once a token exists; prerenders call this with none.
  const checkedAt = now || Date.now();
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      uid?: number;
      exp?: number;
    };
    if (!data.uid || !data.exp || data.exp < checkedAt) return null;
    return { userId: data.uid };
  } catch {
    return null;
  }
}

export function createApiToken(userId: number, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: now + API_TTL_MS, scope: "mobile" }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readApiToken(token: string | undefined, now = 0) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  const checkedAt = now || Date.now();
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      uid?: number;
      exp?: number;
      scope?: string;
    };
    if (data.scope !== "mobile" || !data.uid || !data.exp || data.exp < checkedAt) {
      return null;
    }
    return { userId: data.uid };
  } catch {
    return null;
  }
}

export async function writeSession(userId: number) {
  const store = await cookies();
  store.set(COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "0",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function readSession() {
  await connection();
  const store = await cookies();
  return readSessionToken(store.get(COOKIE)?.value);
}