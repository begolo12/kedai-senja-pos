import { eq, inArray, sql } from "drizzle-orm";
import type { DB } from "./index";
import {
  categories,
  customers,
  orderItems,
  orderPayments,
  orders,
  products,
  purchaseOrderItems,
  purchaseOrders,
  recipeItems,
  storeTables,
  stores,
  suppliers,
  tiers,
  userStores,
  users,
} from "./schema";
import { hashPin } from "../pin";
import { computeTotals, orderNumber } from "../money";

type SeedProduct = {
  sku: string;
  barcode: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  lowStockAt?: number;
  unit?: string;
  options?: string;
};

const SEED_CATEGORIES: {
  name: string;
  color: string;
  station: "bar" | "kitchen";
  sortOrder: number;
}[] = [
  { name: "Espresso", color: "#c47a3b", station: "bar", sortOrder: 1 },
  { name: "Signature Coffee", color: "#a65d2e", station: "bar", sortOrder: 2 },
  { name: "Non-Coffee", color: "#5b7d63", station: "bar", sortOrder: 3 },
  { name: "Manual Brew", color: "#8a6d4b", station: "bar", sortOrder: 4 },
  { name: "Pastry & Bakery", color: "#b5893d", station: "kitchen", sortOrder: 5 },
  { name: "Kitchen & Brunch", color: "#5e6c7a", station: "kitchen", sortOrder: 6 },
];

const SEED_PRODUCTS: SeedProduct[] = [
  { sku: "ESP-AMERICANO", barcode: "8990001000011", name: "Americano", category: "Espresso", price: 2400000, cost: 650000, stock: 80, unit: "cup", options: "Iced,Hot,Extra Shot (+5000)" },
  { sku: "ESP-LATTE", barcode: "8990001000028", name: "Iced Cafe Latte", category: "Espresso", price: 3200000, cost: 1050000, stock: 70, unit: "cup", options: "Iced,Hot,Less Sugar,Oat Milk (+6000),Extra Shot (+5000)" },
  { sku: "ESP-CAPPUCCINO", barcode: "8990001000035", name: "Cappuccino", category: "Espresso", price: 3200000, cost: 1050000, stock: 65, unit: "cup", options: "Hot,Iced,Oat Milk (+6000),Extra Shot (+5000)" },
  { sku: "ESP-FLATWHITE", barcode: "8990001000042", name: "Flat White", category: "Espresso", price: 3400000, cost: 1100000, stock: 50, unit: "cup", options: "Hot,Oat Milk (+6000),Extra Shot (+5000)" },
  { sku: "SIG-AREN", barcode: "8990002000010", name: "Kopi Susu Gula Aren", category: "Signature Coffee", price: 2800000, cost: 900000, stock: 90, unit: "cup", options: "Iced,Less Sugar,Oat Milk (+6000),Extra Shot (+5000)" },
  { sku: "SIG-DIRTY", barcode: "8990002000027", name: "Dirty Latte", category: "Signature Coffee", price: 3600000, cost: 1200000, stock: 45, unit: "cup", options: "Iced,Oat Milk (+6000)" },
  { sku: "SIG-SALTED", barcode: "8990002000034", name: "Salted Caramel Macchiato", category: "Signature Coffee", price: 3500000, cost: 1150000, stock: 50, unit: "cup", options: "Iced,Hot,Extra Caramel (+4000)" },
  { sku: "NON-MATCHA", barcode: "8990003000019", name: "Matcha Latte", category: "Non-Coffee", price: 3400000, cost: 1200000, stock: 55, unit: "cup", options: "Iced,Hot,Less Sugar,Oat Milk (+6000)" },
  { sku: "NON-CHOCO", barcode: "8990003000026", name: "Chocolate Signature", category: "Non-Coffee", price: 3200000, cost: 1100000, stock: 60, unit: "cup", options: "Iced,Hot,Oat Milk (+6000)" },
  { sku: "NON-LYCHEE", barcode: "8990003000033", name: "Lychee Iced Tea", category: "Non-Coffee", price: 2600000, cost: 750000, stock: 75, unit: "cup", options: "Less Sugar,Normal" },
  { sku: "NON-WATER", barcode: "8990003000040", name: "Mineral Water", category: "Non-Coffee", price: 1200000, cost: 350000, stock: 120, unit: "btl" },
  { sku: "BRW-V60", barcode: "8990004000018", name: "V60 Single Origin", category: "Manual Brew", price: 3600000, cost: 1250000, stock: 35, unit: "cup", options: "Hot,Japanese Iced" },
  { sku: "BRW-COLD", barcode: "8990004000025", name: "Cold Brew Black", category: "Manual Brew", price: 3000000, cost: 950000, stock: 40, lowStockAt: 6, unit: "btl" },
  { sku: "PST-CROISSANT", barcode: "8990005000017", name: "Butter Croissant", category: "Pastry & Bakery", price: 2500000, cost: 950000, stock: 24, lowStockAt: 5, unit: "pcs" },
  { sku: "PST-CHOCO", barcode: "8990005000024", name: "Pain au Chocolat", category: "Pastry & Bakery", price: 2800000, cost: 1100000, stock: 20, lowStockAt: 5, unit: "pcs" },
  { sku: "PST-CINNAMON", barcode: "8990005000031", name: "Cinnamon Roll", category: "Pastry & Bakery", price: 2600000, cost: 1000000, stock: 18, lowStockAt: 4, unit: "pcs", options: "Warm,Normal,Cream Cheese (+5000)" },
  { sku: "KTC-FRIES", barcode: "8990006000016", name: "Truffle Fries", category: "Kitchen & Brunch", price: 3200000, cost: 1100000, stock: 30, lowStockAt: 5, unit: "porsi" },
  { sku: "KTC-SANDO", barcode: "8990006000023", name: "Chicken Katsu Sando", category: "Kitchen & Brunch", price: 4800000, cost: 1900000, stock: 20, lowStockAt: 4, unit: "porsi", options: "Original,Spicy,Extra Cheese (+6000)" },
  { sku: "KTC-AGLIO", barcode: "8990006000030", name: "Spaghetti Aglio Olio", category: "Kitchen & Brunch", price: 4500000, cost: 1700000, stock: 22, lowStockAt: 4, unit: "porsi", options: "Level 1,Level 2,Smoked Beef (+8000)" },
  { sku: "KTC-CARBONARA", barcode: "8990006000047", name: "Creamy Carbonara", category: "Kitchen & Brunch", price: 4900000, cost: 1950000, stock: 18, lowStockAt: 4, unit: "porsi" },
];

const SEED_CUSTOMERS = [
  { name: "Ayu Larasati", phone: "081234567801" },
  { name: "Dimas Prakoso", phone: "081234567802" },
  { name: "Sari Wulandari", phone: "081234567803" },
  { name: "Bagas Nugroho", phone: "081234567804" },
  { name: "Nadia Putri", phone: "081234567805" },
];

function lcg(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const SEED_STORES = [
  {
    code: "kemang",
    name: "Kopi Tera — Kemang",
    address: "Jl. Kemang Selatan No. 18, Jakarta Selatan",
    phone: "021 719 2288",
  },
  {
    code: "senopati",
    name: "Kopi Tera — Senopati",
    address: "Jl. Senopati No. 42, Jakarta Selatan",
    phone: "021 829 4411",
  },
];

/** Demo kafe untuk database kosong. Dijalankan sekali lewat `pnpm db:setup`. */
export async function seedIfEmpty(db: DB) {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  const adminPin = process.env.SEED_ADMIN_PIN ?? "admin123";
  if (process.env.NODE_ENV === "production" && !process.env.SEED_ADMIN_PIN) {
    console.warn(
      "[SECURITY] SEED_ADMIN_PIN tidak diatur di production; menggunakan sandi default. Segera ubah lewat Back Office.",
    );
  }
  const demoPin = process.env.SEED_DEMO_PIN ?? "demo123";
  const cashierPin = process.env.SEED_CASHIER_PIN ?? "123456";
  const kitchenPin = process.env.SEED_KITCHEN_PIN ?? "2222";
  if (
    !/^\S{4,64}$/.test(adminPin) ||
    !/^\S{4,64}$/.test(demoPin) ||
    !/^\S{4,64}$/.test(cashierPin) ||
    !/^\S{4,64}$/.test(kitchenPin)
  ) {
    throw new Error(
      "SEED_ADMIN_PIN, SEED_DEMO_PIN, SEED_CASHIER_PIN, dan SEED_KITCHEN_PIN harus 4–64 karakter tanpa spasi.",
    );
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(918273645)`);
    const again = await tx.select({ id: users.id }).from(users).limit(1);
    if (again.length > 0) return;

    const storeRows = await tx
      .insert(stores)
      .values(
        SEED_STORES.map((store) => ({
          ...store,
          currency: "IDR",
          serviceChargeRate: 500,
          taxRate: 1000,
          receiptWidth: "80" as const,
          receiptFooter: "Terima kasih sudah mampir di Kopi Tera.",
          pointsPerAmount: 1_000_000,
          active: true,
        })),
      )
      .returning({ id: stores.id, code: stores.code });

    const staff = await tx
      .insert(users)
      .values([
        {
          name: "Admin Utama",
          username: "admin",
          pinHash: hashPin(adminPin),
          role: "admin",
        },
        {
          name: "Akun Demo",
          username: "demo",
          pinHash: hashPin(demoPin),
          role: "owner",
        },
        {
          name: "Bima Saputra",
          username: "kasir",
          pinHash: hashPin(cashierPin),
          role: "cashier",
        },
        {
          name: "Dina Kartika",
          username: "barista",
          pinHash: hashPin(kitchenPin),
          role: "kitchen",
        },
      ])
      .returning({ id: users.id, role: users.role, username: users.username });

    const admin = staff.find((user) => user.username === "admin")!;
    const demo = staff.find((user) => user.username === "demo")!;
    const cashier = staff.find((user) => user.username === "kasir")!;
    const kitchen = staff.find((user) => user.username === "barista")!;

    // Demo mendapat akses ke kedua toko demo; kasir & barista ke Kemang; admin utama bisa membuka semua toko.
    await tx.insert(userStores).values([
      ...storeRows.map((store) => ({ userId: demo.id, storeId: store.id })),
      { userId: cashier.id, storeId: storeRows[0].id },
      { userId: kitchen.id, storeId: storeRows[0].id },
    ]);

    let productRows: { id: number; name: string; sku: string; price: number; cost: number }[] = [];
    // Resep contoh ditautkan ke produk toko pertama (Kemang).
    let firstStoreProducts: typeof productRows = [];

    for (const [storeIndex, store] of storeRows.entries()) {
      const catRows = await tx
        .insert(categories)
        .values(
          SEED_CATEGORIES.map((category) => ({
            ...category,
            storeId: store.id,
          })),
        )
        .returning({ id: categories.id, name: categories.name });
      const catId = new Map(catRows.map((c) => [c.name, c.id]));

      productRows = await tx
        .insert(products)
        .values(
          SEED_PRODUCTS.map((product) => ({
            storeId: store.id,
            sku: product.sku,
            barcode: product.barcode,
            name: product.name,
            categoryId: catId.get(product.category) ?? null,
            price: product.price,
            cost: product.cost,
            stock: product.stock,
            lowStockAt: product.lowStockAt ?? 5,
            unit: product.unit ?? "pcs",
            options: product.options ?? null,
          })),
        )
        .returning({
          id: products.id,
          name: products.name,
          sku: products.sku,
          price: products.price,
          cost: products.cost,
        });
      if (storeIndex === 0) firstStoreProducts = productRows;

      const customerRows = await tx
        .insert(customers)
        .values(
          SEED_CUSTOMERS.map((customer) => ({
            ...customer,
            storeId: store.id,
          })),
        )
        .returning({ id: customers.id, name: customers.name });

      const rnd = lcg(20261027 + storeIndex * 977);
      const dayCount = new Map<string, number>();
      const nowMs = Date.now();

      for (let day = 13; day >= 0; day--) {
        const weekday = new Date(nowMs - day * 86_400_000).getDay();
        const weekendBoost = weekday === 0 || weekday === 6 ? 7 : 3;
        const ordersToday = weekendBoost + Math.floor(rnd() * 5);

        for (let i = 0; i < ordersToday; i++) {
          const when = new Date(
            nowMs -
              day * 86_400_000 -
              Math.floor(rnd() * 9 * 3_600_000) -
              3_600_000,
          );
          const dateKey = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Jakarta",
          }).format(when);
          const seq = (dayCount.get(dateKey) ?? 0) + 1;
          dayCount.set(dateKey, seq);

          const lineCount = 1 + Math.floor(rnd() * 3);
          const picked: typeof productRows = [];
          for (let j = 0; j < lineCount; j++) {
            const product =
              productRows[Math.floor(rnd() * productRows.length)];
            if (!picked.some((item) => item.id === product.id)) {
              picked.push(product);
            }
          }
          const lines = picked.map((product) => ({
            ...product,
            qty: 1 + Math.floor(rnd() * 2),
          }));
          const totals = computeTotals(
            lines.map((line) => ({ unitPrice: line.price, qty: line.qty })),
            { serviceChargeRate: 500, taxRate: 1000 },
          );
          const method = rnd() < 0.42 ? "cash" : rnd() < 0.75 ? "qris" : "card";
          const paid =
            method === "cash"
              ? Math.ceil(totals.total / 5000000) * 5000000
              : totals.total;
          const customer =
            rnd() < 0.45
              ? customerRows[Math.floor(rnd() * customerRows.length)]
              : null;
          const pointsEarned = customer
            ? Math.floor(totals.total / 1_000_000)
            : 0;
          const orderType = rnd() < 0.7 ? "dine_in" : "takeaway";

          const [order] = await tx
            .insert(orders)
            .values({
              storeId: store.id,
              number: orderNumber(when, seq),
              clientId: `seed-${store.code}-${dateKey}-${seq}`,
              userId: admin.id,
              customerId: customer?.id ?? null,
              subtotal: totals.subtotal,
              serviceChargeAmount: totals.serviceChargeAmount,
              taxAmount: totals.taxAmount,
              total: totals.total,
              costTotal: lines.reduce((sum, line) => sum + line.cost * line.qty, 0),
              pointsEarned,
              orderType,
              tableLabel:
                orderType === "dine_in"
                  ? `Meja ${1 + Math.floor(rnd() * 8)}`
                  : null,
              paymentMethod: method,
              amountPaid: paid,
              changeDue: paid - totals.total,
              createdAt: when,
            })
            .returning({ id: orders.id });

          await tx
            .insert(orderPayments)
            .values({ orderId: order.id, method, amount: totals.total });

          await tx.insert(orderItems).values(
            lines.map((line) => ({
              orderId: order.id,
              productId: line.id,
              name: line.name,
              sku: line.sku,
              unitPrice: line.price,
              cost: line.cost,
              qty: line.qty,
              lineTotal: line.price * line.qty,
            })),
          );

          if (customer) {
            await tx
              .update(customers)
              .set({
                points: sql`${customers.points} + ${pointsEarned}`,
                totalSpent: sql`${customers.totalSpent} + ${totals.total}`,
              })
              .where(sql`${customers.id} = ${customer.id}`);
          }
        }
      }
    }

    // Contoh supplier dan satu PO berjalan agar halaman Pembelian tidak kosong.
    const supplierIds: number[] = [];
    for (const supplier of [
      {
        storeId: storeRows[0].id,
        name: "Toko Bahan Segar",
        phone: "0812 1111 2222",
        note: "Sayur, ayam, dan telur — PO sehari sebelumnya.",
        active: true,
      },
      {
        storeId: storeRows[0].id,
        name: "Distributor Kopi Nusantara",
        phone: "021 555 0199",
        note: "Bubuk minuman, dikirim tiap Selasa.",
        active: true,
      },
    ]) {
      const [row] = await tx
        .insert(suppliers)
        .values(supplier)
        .returning({ id: suppliers.id });
      supplierIds.push(row.id);
    }

    const poProducts = firstStoreProducts.slice(0, 3);
    const [po] = await tx
      .insert(purchaseOrders)
      .values({
        storeId: storeRows[0].id,
        supplierId: supplierIds[0],
        userId: admin.id,
        note: "Restock mingguan",
        totalCost: poProducts.reduce((sum, item) => sum + item.cost * 10, 0),
        expectedAt: new Date(Date.now() + 2 * 86_400_000),
      })
      .returning({ id: purchaseOrders.id });
    await tx.insert(purchaseOrderItems).values(
      poProducts.map((item) => ({
        purchaseOrderId: po.id,
        productId: item.id,
        name: item.name,
        unit: "porsi",
        qty: 10,
        unitCost: item.cost,
      })),
    );

    // Membership tier contoh: Silver default, Gold di atas Rp 5 juta belanja.
    await tx.insert(tiers).values([
      {
        storeId: storeRows[0].id,
        name: "Silver",
        minTotalSpent: 0,
        pointsMultiplier: 100,
        perks: "Poin normal untuk semua pelanggan.",
        active: true,
      },
      {
        storeId: storeRows[0].id,
        name: "Gold",
        minTotalSpent: 5_000_000_00,
        pointsMultiplier: 150,
        perks: "Poin 1,5× setelah total belanja Rp 5 juta.",
        active: true,
      },
    ]);

    // Denah meja contoh (8 meja, 2/4 kursi) + QR self-order siap dipakai.
    await tx.insert(storeTables).values(
      Array.from({ length: 8 }, (_, index) => ({
        storeId: storeRows[0].id,
        name: `Meja ${index + 1}`,
        seats: index < 4 ? 2 : 4,
        active: true,
      })),
    );

    // Resep BOM contoh: Pain au Chocolat memakai 1 Butter Croissant (contoh BOM ringan).
    const bySku = new Map(firstStoreProducts.map((item) => [item.sku, item.id]));
    const chocoPastry = bySku.get("PST-CHOCO");
    const butterCroissant = bySku.get("PST-CROISSANT");
    if (chocoPastry && butterCroissant) {
      await tx.insert(recipeItems).values([
        { productId: chocoPastry, ingredientId: butterCroissant, qty: 1 },
      ]);
    }
  });
}

/** Memastikan akun `admin` dan `demo` tersedia meskipun database sudah terisi sebelumnya. */
export async function ensureCoreAccounts(db: DB) {
  const adminPin = process.env.SEED_ADMIN_PIN ?? "admin123";
  if (process.env.NODE_ENV === "production" && !process.env.SEED_ADMIN_PIN) {
    console.warn(
      "[SECURITY] SEED_ADMIN_PIN tidak diatur di production; menggunakan sandi default. Segera ubah lewat Back Office.",
    );
  }
  const demoPin = process.env.SEED_DEMO_PIN ?? "demo123";

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(918273646)`);

    const existingAdmin = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, "admin"))
      .limit(1);
    if (existingAdmin.length === 0) {
      await tx.insert(users).values({
        name: "Admin Utama",
        username: "admin",
        pinHash: hashPin(adminPin),
        role: "admin",
        active: true,
      });
    }

    const existingDemo = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, "demo"))
      .limit(1);

    let demoId = existingDemo[0]?.id;
    if (!demoId) {
      const [created] = await tx
        .insert(users)
        .values({
          name: "Akun Demo",
          username: "demo",
          pinHash: hashPin(demoPin),
          role: "owner",
          active: true,
        })
        .returning({ id: users.id });
      demoId = created.id;
    }

    const existingDemoStores = await tx
      .select({ storeId: userStores.storeId })
      .from(userStores)
      .where(eq(userStores.userId, demoId))
      .limit(1);

    if (existingDemoStores.length === 0) {
      let targetStores = await tx
        .select({ id: stores.id })
        .from(stores)
        .where(inArray(stores.code, ["kemang", "senopati"]));
      if (targetStores.length === 0) {
        targetStores = await tx
          .select({ id: stores.id })
          .from(stores)
          .where(eq(stores.active, true))
          .limit(1);
      }
      if (targetStores.length > 0) {
        await tx
          .insert(userStores)
          .values(targetStores.map((store) => ({ userId: demoId, storeId: store.id })))
          .onConflictDoNothing();
      }
    }
  });
}
