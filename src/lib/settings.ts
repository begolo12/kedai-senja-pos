import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { stores } from "./db/schema";

export type StoreSettings = {
  id: number;
  storeName: string;
  address: string;
  phone: string;
  currency: string;
  taxRate: number;
  receiptFooter: string;
  receiptWidth: "58" | "80";
  qrisPayload: string;
  pointsPerAmount: number;
  pointsValue: number;
};

export const getSettings = cache(async (storeId: number): Promise<StoreSettings> => {
  const found = await db
    .select()
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);
  const store = found[0];
  if (!store) {
    throw new Error("Toko tidak ditemukan.");
  }
  return {
    id: store.id,
    storeName: store.name,
    address: store.address,
    phone: store.phone,
    currency: store.currency,
    taxRate: store.taxRate,
    receiptFooter: store.receiptFooter,
    receiptWidth: store.receiptWidth,
    qrisPayload: store.qrisPayload,
    pointsPerAmount: store.pointsPerAmount,
    pointsValue: store.pointsValue,
  };
});
