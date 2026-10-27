export type Role = "admin" | "cashier";

export type MobileUser = { id: number; name: string; username: string; role: Role };

export type Settings = {
  storeName: string;
  address: string;
  phone: string;
  currency: string;
  taxRate: number;
  receiptWidth: "58" | "80";
  receiptFooter: string;
  pointsPerAmount: number;
};

export type Category = { id: number; name: string; color: string; sortOrder: number };

export type Product = {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  categoryId: number | null;
  price: number;
  cost: number;
  stock: number;
  unit: string;
};

export type Customer = { id: number; name: string; phone: string | null; points: number };

export type Snapshot = {
  settings: Settings;
  categories: Category[];
  products: Product[];
  customers: Customer[];
  serverTime: string;
};

export type OrderLine = {
  productId: number;
  name: string;
  sku: string;
  unitPrice: number;
  cost: number;
  qty: number;
};

export type PendingOrder = {
  clientId: string;
  items: OrderLine[];
  discountType: "amount" | "percent" | null;
  discountValue: number;
  taxRate: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  costTotal: number;
  paymentMethod: "cash" | "card" | "qris";
  amountPaid: number;
  changeDue: number;
  createdAt: string;
  note?: string;
  status: "pending" | "synced" | "rejected";
  serverNumber?: string;
  serverOrderId?: number;
  error?: string;
};

export type SyncResult = {
  clientId: string;
  status: "created" | "exists" | "rejected";
  orderId?: number;
  number?: string;
  error?: string;
};