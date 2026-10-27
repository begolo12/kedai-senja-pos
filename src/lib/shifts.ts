import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { shifts } from "./db/schema";

export async function getOpenShift(userId: number, storeId: number) {
  const found = await db
    .select()
    .from(shifts)
    .where(
      and(
        eq(shifts.userId, userId),
        eq(shifts.storeId, storeId),
        eq(shifts.status, "open"),
      ),
    )
    .limit(1);
  return found[0];
}
