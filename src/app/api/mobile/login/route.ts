import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getAllowedStores } from "@/lib/auth";
import { verifyPin } from "@/lib/pin";
import { createPendingToken } from "@/lib/session";
import {
  corsHeaders,
  json,
  mobileLoginBlocked,
  mobileLoginFailed,
  mobileLoginOk,
  mobileStore,
  mobileUser,
} from "@/lib/mobile-auth";

const schema = z.object({
  username: z.string().trim().min(1).max(40),
  pin: z.string().trim().regex(/^\d{4,8}$/),
});

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json(request, { error: "ID atau PIN tidak valid." }, 400);
  }
  const username = parsed.data.username.toLowerCase();

  if (mobileLoginBlocked(username)) {
    return json(request, { error: "Terlalu banyak percobaan. Tunggu 5 menit." }, 429);
  }

  const found = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  const user = found[0];
  if (!user || !user.active || !verifyPin(parsed.data.pin, user.pinHash)) {
    mobileLoginFailed(username);
    return json(request, { error: "ID atau PIN salah." }, 401);
  }

  mobileLoginOk(username);
  const stores = await getAllowedStores(user);
  return json(request, {
    pendingToken: createPendingToken(user.id),
    user: mobileUser(user),
    stores: stores.map(mobileStore),
  });
}
