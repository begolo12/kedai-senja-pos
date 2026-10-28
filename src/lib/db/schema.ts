import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  currency: text("currency").notNull().default("IDR"),
  taxRate: integer("tax_rate").notNull().default(1100),
  receiptWidth: text("receipt_width", { enum: ["58", "80"] })
    .notNull()
    .default("80"),
  qrisPayload: text("qris_payload").notNull().default(""),
  receiptFooter: text("receipt_footer").notNull().default("Terima kasih."),
  pointsPerAmount: bigint("points_per_amount", { mode: "number" })
    .notNull()
    .default(1_000_000),
  pointsValue: bigint("points_value", { mode: "number" })
    .notNull()
    .default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  role: text("role", { enum: ["admin", "cashier"] })
    .notNull()
    .default("cashier"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userStores = pgTable(
  "user_stores",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.storeId] })],
);

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#8a6f4a"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("categories_store_name_idx").on(t.storeId, t.name)],
);

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    price: bigint("price", { mode: "number" }).notNull(),
    cost: bigint("cost", { mode: "number" }).notNull().default(0),
    stock: integer("stock").notNull().default(0),
    lowStockAt: integer("low_stock_at").notNull().default(5),
    unit: text("unit").notNull().default("pcs"),
    options: text("options"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("products_store_sku_idx").on(t.storeId, t.sku),
    uniqueIndex("products_store_barcode_idx").on(t.storeId, t.barcode),
    index("products_store_category_idx").on(t.storeId, t.categoryId),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    points: integer("points").notNull().default(0),
    totalSpent: bigint("total_spent", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("customers_store_phone_idx").on(t.storeId, t.phone)],
);

export const shifts = pgTable(
  "shifts",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    openingFloat: bigint("opening_float", { mode: "number" })
      .notNull()
      .default(0),
    countedCash: bigint("counted_cash", { mode: "number" }),
    expectedCash: bigint("expected_cash", { mode: "number" }),
    note: text("note"),
    status: text("status", { enum: ["open", "closed"] })
      .notNull()
      .default("open"),
  },
  (t) => [
    index("shifts_store_user_status_idx").on(t.storeId, t.userId, t.status),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    clientId: text("client_id").notNull(),
    shiftId: integer("shift_id").references(() => shifts.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    customerId: integer("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    subtotal: bigint("subtotal", { mode: "number" }).notNull(),
    discountType: text("discount_type", { enum: ["amount", "percent"] }),
    discountValue: bigint("discount_value", { mode: "number" })
      .notNull()
      .default(0),
    discountAmount: bigint("discount_amount", { mode: "number" })
      .notNull()
      .default(0),
    taxAmount: bigint("tax_amount", { mode: "number" }).notNull().default(0),
    total: bigint("total", { mode: "number" }).notNull(),
    costTotal: bigint("cost_total", { mode: "number" }).notNull().default(0),
    pointsEarned: integer("points_earned").notNull().default(0),
    pointsRedeemed: integer("points_redeemed").notNull().default(0),
    redeemAmount: bigint("redeem_amount", { mode: "number" }).notNull().default(0),
    voucherCode: text("voucher_code"),
    voucherAmount: bigint("voucher_amount", { mode: "number" })
      .notNull()
      .default(0),
    orderType: text("order_type", { enum: ["dine_in", "takeaway"] })
      .notNull()
      .default("dine_in"),
    tableLabel: text("table_label"),
    paymentMethod: text("payment_method", {
      enum: ["cash", "card", "qris", "mixed"],
    }).notNull(),
    amountPaid: bigint("amount_paid", { mode: "number" }).notNull(),
    changeDue: bigint("change_due", { mode: "number" }).notNull().default(0),
    status: text("status", {
      enum: ["completed", "refunded", "partially_refunded"],
    })
      .notNull()
      .default("completed"),
    note: text("note"),
    refundedTotal: bigint("refunded_total", { mode: "number" })
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundedBy: integer("refunded_by").references(() => users.id),
  },
  (t) => [
    uniqueIndex("orders_store_number_idx").on(t.storeId, t.number),
    uniqueIndex("orders_client_id_idx").on(t.clientId),
    index("orders_store_created_idx").on(t.storeId, t.createdAt),
    index("orders_shift_idx").on(t.shiftId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
    cost: bigint("cost", { mode: "number" }).notNull().default(0),
    qty: integer("qty").notNull(),
    refundedQty: integer("refunded_qty").notNull().default(0),
    note: text("note"),
    lineTotal: bigint("line_total", { mode: "number" }).notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const orderPayments = pgTable(
  "order_payments",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    method: text("method", { enum: ["cash", "card", "qris"] }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
  },
  (t) => [index("order_payments_order_idx").on(t.orderId)],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason", {
      enum: ["sale", "refund", "restock", "correction", "waste"],
    }).notNull(),
    refType: text("ref_type"),
    refId: integer("ref_id"),
    userId: integer("user_id").references(() => users.id),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("stock_movements_store_product_idx").on(
      t.storeId,
      t.productId,
      t.createdAt,
    ),
  ],
);

export const vouchers = pgTable(
  "vouchers",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    label: text("label").notNull().default(""),
    type: text("type", { enum: ["percent", "fixed"] })
      .notNull()
      .default("percent"),
    value: bigint("value", { mode: "number" }).notNull().default(0),
    minSubtotal: bigint("min_subtotal", { mode: "number" }).notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    usageLimit: integer("usage_limit").notNull().default(0),
    usedCount: integer("used_count").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("vouchers_store_code_idx").on(t.storeId, t.code)],
);

export type Store = typeof stores.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderPayment = typeof orderPayments.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type User = typeof users.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Voucher = typeof vouchers.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;

export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    note: text("note").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("suppliers_store_name_idx").on(t.storeId, t.name)],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    supplierId: integer("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status", {
      enum: ["ordered", "received", "cancelled"],
    })
      .notNull()
      .default("ordered"),
    note: text("note"),
    totalCost: bigint("total_cost", { mode: "number" }).notNull().default(0),
    expectedAt: timestamp("expected_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("purchase_orders_store_created_idx").on(t.storeId, t.createdAt)],
);

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: serial("id").primaryKey(),
    purchaseOrderId: integer("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    unit: text("unit").notNull().default("pcs"),
    qty: integer("qty").notNull(),
    unitCost: bigint("unit_cost", { mode: "number" }).notNull().default(0),
    receivedQty: integer("received_qty").notNull().default(0),
  },
  (t) => [index("purchase_order_items_po_idx").on(t.purchaseOrderId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    success: boolean("success").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("login_attempts_username_created_idx").on(t.username, t.createdAt)],
);