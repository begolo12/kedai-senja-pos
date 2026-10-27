import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { stores, users } from "@/lib/db/schema";
import { userCanUseStore } from "@/lib/auth";
import { readPendingToken, createApiToken } from "@/lib/session";
import {
  corsHeaders,
  json,
  mobileStore,
  mobileUser,
} from "@/lib/mobile-auth";

const schema = z.object({ storeId: z.number().int().positive() });

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const pending = readPendingToken(
    header.startsWith("Bearer ") ? header.slice(7) : undefined,
  );
  if (!pending) return json(request, { error: "Sesi login berakhir." }, 401);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(request, { error: "Toko tidak valid." }, 400);

  const found = await db
    .select()
    .from(users)
    .where(eq(users.id, pending.userId))
    .limit(1);
  const user = found[0];
  if (!user || !user.active) return json(request, { error: "Akun tidak aktif." }, 401);
  if (!(await userCanUseStore(user, parsed.data.storeId))) {
    return json(request, { error: "Toko tidak tersedia untuk akun ini." }, 403);
  }

  const storeRows = await db
    .select()
    .from(stores)
    .where(and(eq(stores.id, parsed.data.storeId), eq(stores.active, true)))
    .limit(1);
  const store = storeRows[0];
  if (!store) return json(request, { error: "Toko tidak aktif." }, 404);

  return json(request, {
    token: createApiToken(user.id, store.id),
    user: mobileUser(user),
    store: mobileStore(store),
  });
}
