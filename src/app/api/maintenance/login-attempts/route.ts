import { lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Pembersihan berkala tabel login_attempts (baris > 1 jam tidak relevan
 * untuk throttle 5 menit). Dipanggil cron Vercel harian; dipicu manual
 * dengan header x-cron-secret bila CRON_SECRET diatur.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("x-cron-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const deleted = await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, cutoff));
  return Response.json({ ok: true, deleted: deleted.rowCount ?? 0 });
}
