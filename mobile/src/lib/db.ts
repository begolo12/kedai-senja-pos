import Dexie, { type Table } from "dexie";
import type {
  Category,
  Customer,
  PendingOrder,
  Product,
  Settings,
} from "./types";

type MetaRow = { key: string; value: string };

class PosDatabase extends Dexie {
  meta!: Table<MetaRow, string>;
  products!: Table<Product, number>;
  categories!: Table<Category, number>;
  customers!: Table<Customer, number>;
  settings!: Table<Settings & { id: number }, number>;
  orders!: Table<PendingOrder, string>;

  constructor() {
    super("kasir-senja");
    this.version(1).stores({
      meta: "key",
      products: "id, name, sku, barcode, categoryId",
      categories: "id",
      customers: "id",
      settings: "id",
      orders: "clientId, status, createdAt",
    });
  }
}

export const db = new PosDatabase();

export async function saveSnapshot(snapshot: {
  settings: Settings;
  categories: Category[];
  products: Product[];
  customers: Customer[];
  serverTime: string;
}) {
  await db.transaction("rw", db.settings, db.categories, db.products, db.customers, db.meta, async () => {
    await Promise.all([
      db.settings.clear(),
      db.categories.clear(),
      db.products.clear(),
      db.customers.clear(),
    ]);
    await db.settings.put({ ...snapshot.settings, id: 1 });
    await db.categories.bulkPut(snapshot.categories);
    await db.products.bulkPut(snapshot.products);
    await db.customers.bulkPut(snapshot.customers);
    await db.meta.put({ key: "lastSync", value: snapshot.serverTime });
  });
}

export async function clearLocalData() {
  await Promise.all([
    db.products.clear(),
    db.categories.clear(),
    db.customers.clear(),
    db.settings.clear(),
    db.orders.clear(),
    db.meta.clear(),
  ]);
}

export async function getSetting(): Promise<Settings | undefined> {
  const row = await db.settings.get(1);
  if (!row) return undefined;
  return {
    storeName: row.storeName,
    address: row.address,
    phone: row.phone,
    currency: row.currency,
    taxRate: row.taxRate,
    receiptWidth: row.receiptWidth,
    qrisPayload: row.qrisPayload,
    receiptFooter: row.receiptFooter,
    pointsPerAmount: row.pointsPerAmount,
  };
}