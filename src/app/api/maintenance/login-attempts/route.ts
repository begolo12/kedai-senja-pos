import { lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Pembersihan berkala tabel login_attempts (baris > 1 jam tidak relevan
 * untuk throttle 5 menit). Dipanggil cron Vercel harian — Vercel mengirim
 * header Authorization: Bearer <CRON_SECRET> otomatis; pemicu manual bisa
 * memakai header x-cron-secret. Wajib CRON_SECRET di production.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return Response.json({ error: "CRON_SECRET belum diatur." }, { status: 503 });
  }
  if (secret) {
    const bearer = request.headers.get("authorization");
    const manual = request.headers.get("x-cron-secret");
    if (bearer !== `Bearer ${secret}` && manual !== secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const deleted = await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, cutoff));
  return Response.json({ ok: true, deleted: deleted.rowCount ?? 0 });
}
