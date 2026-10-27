import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#8a6f4a"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
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
    uniqueIndex("products_sku_idx").on(t.sku),
    uniqueIndex("products_barcode_idx").on(t.barcode),
    index("products_category_idx").on(t.categoryId),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    points: integer("points").notNull().default(0),
    totalSpent: bigint("total_spent", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("customers_phone_idx").on(t.phone)],
);

export const shifts = pgTable(
  "shifts",
  {
    id: serial("id").primaryKey(),
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
  (t) => [index("shifts_user_status_idx").on(t.userId, t.status)],
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
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
    orderType: text("order_type", { enum: ["dine_in", "takeaway"] })
      .notNull()
      .default("dine_in"),
    tableLabel: text("table_label"),
    paymentMethod: text("payment_method", {
      enum: ["cash", "card", "qris"],
    }).notNull(),
    amountPaid: bigint("amount_paid", { mode: "number" }).notNull(),
    changeDue: bigint("change_due", { mode: "number" }).notNull().default(0),
    status: text("status", { enum: ["completed", "refunded"] })
      .notNull()
      .default("completed"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundedBy: integer("refunded_by").references(() => users.id),
  },
  (t) => [
    uniqueIndex("orders_number_idx").on(t.number),
    uniqueIndex("orders_client_id_idx").on(t.clientId),
    index("orders_created_idx").on(t.createdAt),
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
    note: text("note"),
    lineTotal: bigint("line_total", { mode: "number" }).notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
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
  (t) => [index("stock_movements_product_idx").on(t.productId, t.createdAt)],
);

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  storeName: text("store_name").notNull().default("Kedai Senja"),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  currency: text("currency").notNull().default("IDR"),
  taxRate: integer("tax_rate").notNull().default(1100),
  receiptFooter: text("receipt_footer").notNull().default("Terima kasih."),
  receiptWidth: text("receipt_width", { enum: ["58", "80"] })
    .notNull()
    .default("80"),
  qrisPayload: text("qris_payload").notNull().default(""),
  pointsPerAmount: bigint("points_per_amount", { mode: "number" })
    .notNull()
    .default(1_000_000),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type User = typeof users.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;