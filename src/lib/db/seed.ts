import { sql } from "drizzle-orm";
import type { DB } from "./index";
import {
  categories,
  customers,
  orderItems,
  orders,
  products,
  settings,
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

const SEED_CATEGORIES = [
  { name: "Ricebowl", color: "#a2542a", sortOrder: 1 },
  { name: "Sushi", color: "#4f5b66", sortOrder: 2 },
  { name: "Minuman Bubuk", color: "#6b7a4f", sortOrder: 3 },
  { name: "Camilan", color: "#b07b3a", sortOrder: 4 },
  { name: "Tambahan", color: "#7a5c8c", sortOrder: 5 },
];

const SEED_PRODUCTS: SeedProduct[] = [
  { sku: "RCB-GEPREK", barcode: "8990001000011", name: "Ricebowl Ayam Geprek", category: "Ricebowl", price: 1800000, cost: 850000, stock: 40, unit: "porsi", options: "Level 1,Level 2,Level 3,Level 4,Level 5" },
  { sku: "RCB-TERI", barcode: "8990001000028", name: "Ricebowl Ayam Teriyaki", category: "Ricebowl", price: 2000000, cost: 950000, stock: 35, unit: "porsi", options: "Original,Extra saus" },
  { sku: "RCB-BEEF", barcode: "8990001000035", name: "Ricebowl Beef Blackpepper", category: "Ricebowl", price: 2400000, cost: 1200000, stock: 30, unit: "porsi", options: "Tidak pedas,Pedas" },
  { sku: "RCB-TELUR", barcode: "8990001000042", name: "Ricebowl Telur Sambal", category: "Ricebowl", price: 1400000, cost: 600000, stock: 35, unit: "porsi", options: "Level 1,Level 2,Level 3" },
  { sku: "RCB-KATSU", barcode: "8990001000059", name: "Ricebowl Ayam Katsu", category: "Ricebowl", price: 2100000, cost: 1000000, stock: 25, unit: "porsi", options: "Saus teriyaki,Saus mentai" },
  { sku: "RCB-DORI", barcode: "8990001000066", name: "Ricebowl Ikan Dori", category: "Ricebowl", price: 2300000, cost: 1100000, stock: 20, unit: "porsi", options: "Sambal matah,Saus tartar" },
  { sku: "SSH-SALMON", barcode: "8990002000010", name: "Sushi Salmon Mentai 6 pcs", category: "Sushi", price: 2500000, cost: 1400000, stock: 15, lowStockAt: 5, unit: "porsi" },
  { sku: "SSH-TUNA", barcode: "8990002000027", name: "Sushi Tuna Mayo 6 pcs", category: "Sushi", price: 2200000, cost: 1200000, stock: 12, lowStockAt: 4, unit: "porsi" },
  { sku: "SSH-KANI", barcode: "8990002000034", name: "Sushi Kani Mayo 6 pcs", category: "Sushi", price: 2000000, cost: 1000000, stock: 12, lowStockAt: 4, unit: "porsi" },
  { sku: "SSH-TAMAGO", barcode: "8990002000041", name: "Sushi Tamago 6 pcs", category: "Sushi", price: 1800000, cost: 900000, stock: 10, lowStockAt: 4, unit: "porsi" },
  { sku: "SSH-PLATTER", barcode: "8990002000058", name: "Sushi Platter 24 pcs", category: "Sushi", price: 8500000, cost: 4800000, stock: 6, lowStockAt: 3, unit: "porsi" },
  { sku: "SSH-BAKAR", barcode: "8990002000065", name: "Sushi Bakar Mix 8 pcs", category: "Sushi", price: 3200000, cost: 1800000, stock: 8, lowStockAt: 4, unit: "porsi", options: "Original,Extra mentai" },
  { sku: "MNM-TEH", barcode: "8990003000019", name: "Es Teh Manis", category: "Minuman Bubuk", price: 500000, cost: 150000, stock: 100, unit: "gelas", options: "Normal,Less sugar,No sugar" },
  { sku: "MNM-JERUK", barcode: "8990003000026", name: "Es Jeruk", category: "Minuman Bubuk", price: 700000, cost: 250000, stock: 80, unit: "gelas", options: "Normal,Less sugar" },
  { sku: "MNM-MILO", barcode: "8990003000033", name: "Milo Dingin", category: "Minuman Bubuk", price: 1000000, cost: 400000, stock: 70, unit: "gelas", options: "Normal,Extra milo" },
  { sku: "MNM-MATCHA", barcode: "8990003000040", name: "Matcha Latte", category: "Minuman Bubuk", price: 1200000, cost: 500000, stock: 60, unit: "gelas", options: "Dingin,Panas" },
  { sku: "MNM-RED", barcode: "8990003000057", name: "Red Velvet Latte", category: "Minuman Bubuk", price: 1200000, cost: 500000, stock: 60, unit: "gelas", options: "Dingin,Panas" },
  { sku: "MNM-COKELAT", barcode: "8990003000064", name: "Cokelat Bubuk", category: "Minuman Bubuk", price: 1000000, cost: 400000, stock: 70, unit: "gelas", options: "Dingin,Panas" },
  { sku: "MNM-LEMON", barcode: "8990003000071", name: "Lemon Tea", category: "Minuman Bubuk", price: 800000, cost: 300000, stock: 80, unit: "gelas", options: "Normal,Less sugar" },
  { sku: "MNM-KOPI", barcode: "8990003000088", name: "Kopi Susu Bubuk", category: "Minuman Bubuk", price: 800000, cost: 300000, stock: 90, unit: "gelas", options: "Dingin,Panas" },
  { sku: "MNM-BOBA", barcode: "8990003000095", name: "Boba Brown Sugar", category: "Minuman Bubuk", price: 1300000, cost: 550000, stock: 50, unit: "gelas", options: "Normal,Less sugar" },
  { sku: "CML-KENTANG", barcode: "8990004000018", name: "Kentang Goreng", category: "Camilan", price: 1200000, cost: 500000, stock: 25, lowStockAt: 5, unit: "porsi", options: "Original,Extra saus" },
  { sku: "CML-PISANG", barcode: "8990004000025", name: "Pisang Goreng", category: "Camilan", price: 1000000, cost: 400000, stock: 20, lowStockAt: 5, unit: "porsi" },
  { sku: "CML-TAHU", barcode: "8990004000032", name: "Tahu Cireng", category: "Camilan", price: 800000, cost: 350000, stock: 25, lowStockAt: 5, unit: "porsi", options: "Original,Pedas" },
  { sku: "TMB-NASI", barcode: "8990005000017", name: "Extra Nasi", category: "Tambahan", price: 300000, cost: 100000, stock: 50, unit: "porsi" },
  { sku: "TMB-TELUR", barcode: "8990005000024", name: "Extra Telur", category: "Tambahan", price: 400000, cost: 200000, stock: 50, unit: "pcs" },
  { sku: "TMB-SAMBAL", barcode: "8990005000031", name: "Extra Sambal", category: "Tambahan", price: 200000, cost: 50000, stock: 60, unit: "sachet" },
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

/** Demo cafe for an empty database. Run once from `pnpm db:setup`. */
export async function seedIfEmpty(db: DB) {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  const adminPin = process.env.SEED_ADMIN_PIN ?? (process.env.NODE_ENV === "production" ? "" : "1234");
  const cashierPin = process.env.SEED_CASHIER_PIN ?? (process.env.NODE_ENV === "production" ? "" : "5678");
  if (!/^\d{4,8}$/.test(adminPin) || !/^\d{4,8}$/.test(cashierPin)) {
    throw new Error(
      "SEED_ADMIN_PIN dan SEED_CASHIER_PIN wajib (4–8 digit) sebelum seed production.",
    );
  }

  await db.transaction(async (tx) => {
    // Prevent two setup jobs from seeding at the same time.
    await tx.execute(sql`select pg_advisory_xact_lock(918273645)`);
    const again = await tx.select({ id: users.id }).from(users).limit(1);
    if (again.length > 0) return;

    await tx.insert(settings).values({
      id: 1,
      storeName: "Kedai Senja",
      address: "Jl. Cikajang No. 14, Kebayoran Baru, Jakarta Selatan",
      phone: "021 7279 4410",
      currency: "IDR",
      taxRate: 1100,
      receiptFooter: "Terima kasih. Sampai jumpa di senja berikutnya.",
      receiptWidth: "80",
      pointsPerAmount: 1_000_000,
    });

    const staff = await tx
      .insert(users)
      .values([
        {
          name: "Rani Kusuma",
          username: "manajemen",
          pinHash: hashPin(adminPin),
          role: "admin",
        },
        {
          name: "Bima Saputra",
          username: "kasir",
          pinHash: hashPin(cashierPin),
          role: "cashier",
        },
      ])
      .returning({ id: users.id, role: users.role });

    const admin = staff.find((user) => user.role === "admin")!;

    const catRows = await tx
      .insert(categories)
      .values(SEED_CATEGORIES)
      .returning({ id: categories.id, name: categories.name });
    const catId = new Map(catRows.map((c) => [c.name, c.id]));

    const productRows = await tx
      .insert(products)
      .values(
        SEED_PRODUCTS.map((p) => ({
          sku: p.sku,
          barcode: p.barcode,
          name: p.name,
          categoryId: catId.get(p.category) ?? null,
          price: p.price,
          cost: p.cost,
          stock: p.stock,
          lowStockAt: p.lowStockAt ?? 5,
          unit: p.unit ?? "pcs",
          options: p.options ?? null,
        })),
      )
      .returning({
        id: products.id,
        name: products.name,
        sku: products.sku,
        price: products.price,
        cost: products.cost,
      });

    const customerRows = await tx
      .insert(customers)
      .values(SEED_CUSTOMERS)
      .returning({ id: customers.id, name: customers.name });

    // 14 days of believable sales so reports and the dashboard have signal.
    const rnd = lcg(20261027);
    const dayCount = new Map<string, number>();
    const nowMs = Date.now();

    for (let day = 13; day >= 0; day--) {
      const weekday = new Date(nowMs - day * 86_400_000).getDay();
      const weekendBoost = weekday === 0 || weekday === 6 ? 7 : 3;
      const ordersToday = weekendBoost + Math.floor(rnd() * 5);

      for (let i = 0; i < ordersToday; i++) {
        const when = new Date(
          nowMs - day * 86_400_000 - Math.floor(rnd() * 9 * 3_600_000) - 3_600_000,
        );
        const dateKey = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta",
        }).format(when);
        const seq = (dayCount.get(dateKey) ?? 0) + 1;
        dayCount.set(dateKey, seq);

        const lineCount = 1 + Math.floor(rnd() * 3);
        const picked: typeof productRows = [];
        for (let j = 0; j < lineCount; j++) {
          const p = productRows[Math.floor(rnd() * productRows.length)];
          if (!picked.some((x) => x.id === p.id)) picked.push(p);
        }
        const lines = picked.map((p) => ({
          ...p,
          qty: 1 + Math.floor(rnd() * 2),
        }));
        const totals = computeTotals(
          lines.map((l) => ({ unitPrice: l.price, qty: l.qty })),
          { taxRate: 1100 },
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

        const [order] = await tx
          .insert(orders)
          .values({
            number: orderNumber(when, seq),
            clientId: `seed-${dateKey}-${seq}`,
            userId: admin.id,
            customerId: customer?.id ?? null,
            subtotal: totals.subtotal,
            taxAmount: totals.taxAmount,
            total: totals.total,
            costTotal: lines.reduce((s, l) => s + l.cost * l.qty, 0),
            pointsEarned,
            paymentMethod: method,
            amountPaid: paid,
            changeDue: paid - totals.total,
            createdAt: when,
          })
          .returning({ id: orders.id });

        await tx.insert(orderItems).values(
          lines.map((l) => ({
            orderId: order.id,
            productId: l.id,
            name: l.name,
            sku: l.sku,
            unitPrice: l.price,
            cost: l.cost,
            qty: l.qty,
            lineTotal: l.price * l.qty,
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
  });
}