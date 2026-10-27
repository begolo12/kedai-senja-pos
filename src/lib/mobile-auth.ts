import { eq } from "drizzle-orm";
import { db } from "./db";
import { users, type User } from "./db/schema";
import { readApiToken } from "./session";

const DEFAULT_ORIGINS = [
  "capacitor://localhost",
  "https://localhost",
  "http://localhost",
  "http://localhost:5173",
];

function allowedOrigins() {
  const extra = (process.env.MOBILE_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowed = origin && allowedOrigins().has(origin);
  return {
    ...(allowed ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

export function json(
  request: Request,
  data: unknown,
  status = 200,
): Response {
  return Response.json(data, { status, headers: corsHeaders(request) });
}

export async function getMobileUser(request: Request): Promise<User | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  const session = readApiToken(token);
  if (!session) return null;
  const found = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const user = found[0];
  return user && user.active ? user : null;
}

export function mobileUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
  };
}

// Per-instance login throttle; enough for a single POS backend.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function mobileLoginBlocked(key: string, now = Date.now()) {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function mobileLoginFailed(key: string, now = Date.now()) {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function mobileLoginOk(key: string) {
  attempts.delete(key);
}