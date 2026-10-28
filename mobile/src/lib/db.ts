import Dexie, { type Table } from "dexie";
import type {
  Category,
  Customer,
  LocalCustomer,
  PendingOrder,
  Product,
  Settings,
  Voucher,
} from "./types";

type MetaRow = { key: string; value: string };

class PosDatabase extends Dexie {
  meta!: Table<MetaRow, string>;
  products!: Table<Product, number>;
  categories!: Table<Category, number>;
  customers!: Table<Customer, number>;
  localCustomers!: Table<LocalCustomer, number>;
  vouchers!: Table<Voucher, string>;
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
    this.version(2).stores({
      meta: "key",
      products: "id, name, sku, barcode, categoryId",
      categories: "id",
      customers: "id",
      localCustomers: "id, clientId",
      vouchers: "code",
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
  vouchers: Voucher[];
  serverTime: string;
  storeId: number;
}) {
  await db.transaction(
    "rw",
    [db.settings, db.categories, db.products, db.customers, db.vouchers, db.meta],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.categories.clear(),
        db.products.clear(),
        db.customers.clear(),
        db.vouchers.clear(),
      ]);
      await db.settings.put({ ...snapshot.settings, id: 1 });
      await db.categories.bulkPut(snapshot.categories);
      await db.products.bulkPut(snapshot.products);
      await db.customers.bulkPut(snapshot.customers);
      await db.vouchers.bulkPut(snapshot.vouchers);
      await db.meta.put({ key: "lastSync", value: snapshot.serverTime });
      await db.meta.put({ key: "storeId", value: String(snapshot.storeId) });
    },
  );
}

/** Switching stores must never mix catalogs or pending orders. */
export async function prepareStore(storeId: number) {
  const meta = await db.meta.get("storeId");
  if (meta?.value === String(storeId)) return;
  const pending = await db.orders.where("status").equals("pending").count();
  if (pending > 0) {
    throw new Error("Sinkronkan pesanan offline dulu sebelum pindah toko.");
  }
  await db.products.clear();
  await db.categories.clear();
  await db.customers.clear();
  await db.localCustomers.clear();
  await db.vouchers.clear();
  await db.settings.clear();
  await db.orders.clear();
  await db.meta.put({ key: "storeId", value: String(storeId) });
}

export async function clearLocalData() {
  await Promise.all([
    db.products.clear(),
    db.categories.clear(),
    db.customers.clear(),
    db.localCustomers.clear(),
    db.vouchers.clear(),
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
    pointsValue: row.pointsValue ?? 0,
  };
}

export async function listCustomers(): Promise<Customer[]> {
  const [server, local] = await Promise.all([
    db.customers.toArray(),
    db.localCustomers.toArray(),
  ]);
  const merged: Customer[] = server.map((customer) => ({ ...customer }));
  for (const entry of local) {
    // Entri yang sudah punya serverId diwakili baris server dari snapshot.
    if (entry.serverId) continue;
    if (!merged.some((customer) => customer.id === entry.id)) {
      merged.push({
        id: entry.id,
        name: entry.name,
        phone: entry.phone,
        points: entry.points,
      });
    }
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

/** Pelanggan baru dibuat offline: id lokal negatif sampai sinkron memberi id server. */
export async function createLocalCustomer(name: string, phone: string): Promise<LocalCustomer> {
  const entry: LocalCustomer = {
    id: -Date.now(),
    clientId: crypto.randomUUID(),
    name: name.trim(),
    phone: phone.trim() || null,
    points: 0,
    pendingUpload: true,
  };
  await db.localCustomers.put(entry);
  return entry;
}

export async function pendingLocalCustomers(): Promise<LocalCustomer[]> {
  return db.localCustomers.where("clientId").notEqual("").filter((entry) => entry.pendingUpload).toArray();
}

/**
 * Setelah sinkron: pelanggan sudah ada di snapshot server; simpan serverId di
 * entri lokal supaya pilihan kasir dan relasi pesanan tetap tersambung.
 */
export async function reconcileLocalCustomers(
  results: { clientId: string; status: "created" | "exists"; id?: number }[],
) {
  for (const result of results) {
    const entries = await db.localCustomers.where("clientId").equals(result.clientId).toArray();
    for (const entry of entries) {
      await db.localCustomers.put({
        ...entry,
        serverId: result.id ?? entry.serverId,
        pendingUpload: false,
      });
    }
  }
}

/** Id server dari id lokal pelanggan (bila sudah terunggah). */
export async function serverIdForLocalCustomer(localId: number): Promise<number | null> {
  const entry = await db.localCustomers.get(localId);
  return entry?.serverId ?? null;
}
