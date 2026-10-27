import { cache } from "react";
import { db } from "./db";
import { settings, type Settings } from "./db/schema";

const FALLBACK: Settings = {
  id: 1,
  storeName: "Kedai Senja",
  address: "",
  phone: "",
  currency: "IDR",
  taxRate: 1100,
  receiptFooter: "Terima kasih.",
  receiptWidth: "80",
  pointsPerAmount: 1_000_000,
  updatedAt: new Date(),
};

export const getSettings = cache(async (): Promise<Settings> => {
  const found = await db.select().from(settings).limit(1);
  return found[0] ?? FALLBACK;
});