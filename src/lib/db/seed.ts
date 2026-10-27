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
};

const SEED_CATEGORIES = [
  { name: "Kopi", color: "#a2542a", sortOrder: 1 },
  { name: "Non-Kopi", color: "#6b7a4f", sortOrder: 2 },
  { name: "Dapur", color: "#8c4a3c", sortOrder: 3 },
  { name: "Roti & Kue", color: "#b07b3a", sortOrder: 4 },
  { name: "Biji & Kemasan", color: "#4f5b66", sortOrder: 5 },
];

const SEED_PRODUCTS: SeedProduct[] = [
  { sku: "KOP-ESP", barcode: "8990001000011", name: "Espresso", category: "Kopi", price: 1800000, cost: 600000, stock: 120, unit: "shot" },
  { sku: "KOP-AME", barcode: "8990001000028", name: "Americano", category: "Kopi", price: 2200000, cost: 700000, stock: 96, unit: "cup" },
  { sku: "KOP-LAT", barcode: "8990001000035", name: "Caffè Latte", category: "Kopi", price: 2800000, cost: 950000, stock: 88, unit: "cup" },
  { sku: "KOP-CAP", barcode: "8990001000042", name: "Cappuccino", category: "Kopi", price: 2800000, cost: 950000, stock: 76, unit: "cup" },
  { sku: "KOP-MOC", barcode: "8990001000059", name: "Mocha Senja", category: "Kopi", price: 3200000, cost: 1200000, stock: 54, unit: "cup" },
  { sku: "KOP-KOP", barcode: "8990001000066", name: "Kopi Susu Gula Aren", category: "Kopi", price: 2600000, cost: 900000, stock: 110, unit: "cup" },
  { sku: "KOP-V60", barcode: "8990001000073", name: "V60 Single Origin", category: "Kopi", price: 3400000, cost: 1300000, stock: 40, unit: "cup" },
  { sku: "KOP-CLD", barcode: "8990001000080", name: "Cold Brew 12 Jam", category: "Kopi", price: 3000000, cost: 1000000, stock: 32, unit: "bottle" },
  { sku: "NKP-MAT", barcode: "8990002000010", name: "Matcha Latte", category: "Non-Kopi", price: 3000000, cost: 1150000, stock: 42, unit: "cup" },
  { sku: "NKP-CHO", barcode: "8990002000027", name: "Cokelat Panas", category: "Non-Kopi", price: 2700000, cost: 900000, stock: 38, unit: "cup" },
  { sku: "NKP-LEM", barcode: "8990002000034", name: "Lemon Tea", category: "Non-Kopi", price: 2000000, cost: 550000, stock: 64, unit: "glass" },
  { sku: "NKP-TEH", barcode: "8990002000041", name: "Teh Melati", category: "Non-Kopi", price: 1500000, cost: 350000, stock: 90, unit: "glass" },
  { sku: "NKP-SOD", barcode: "8990002000058", name: "Soda Jeruk", category: "Non-Kopi", price: 2400000, cost: 700000, stock: 24, unit: "glass" },
  { sku: "DPR-NAS", barcode: "8990003000019", name: "Nasi Goreng Senja", category: "Dapur", price: 3800000, cost: 1700000, stock: 25, unit: "plate" },
  { sku: "DPR-MIE", barcode: "8990003000026", name: "Mie Goreng Jawa", category: "Dapur", price: 3400000, cost: 1450000, stock: 22, unit: "plate" },
  { sku: "DPR-AYA", barcode: "8990003000033", name: "Ayam Geprek", category: "Dapur", price: 3200000, cost: 1400000, stock: 18, unit: "plate" },
  { sku: "DPR-TAH", barcode: "8990003000040", name: "Tahu Crispy", category: "Dapur", price: 1800000, cost: 650000, stock: 30, unit: "portion" },
  { sku: "RTI-CRO", barcode: "8990004000018", name: "Croissant Butter", category: "Roti & Kue", price: 2400000, cost: 1000000, stock: 14, lowStockAt: 6, unit: "pcs" },
  { sku: "RTI-BAN", barcode: "8990004000025", name: "Banana Bread", category: "Roti & Kue", price: 2200000, cost: 850000, stock: 9, lowStockAt: 5, unit: "slice" },
  { sku: "RTI-CIN", barcode: "8990004000032", name: "Cinnamon Roll", category: "Roti & Kue", price: 2600000, cost: 1050000, stock: 4, lowStockAt: 6, unit: "pcs" },
  { sku: "RTI-BRO", barcode: "8990004000049", name: "Brownies Fudge", category: "Roti & Kue", price: 2000000, cost: 750000, stock: 11, unit: "slice" },
  { sku: "BJI-HOU", barcode: "8990005000017", name: "House Blend 250g", category: "Biji & Kemasan", price: 9500000, cost: 6000000, stock: 20, lowStockAt: 4, unit: "bag" },
  { sku: "BJI-GAY", barcode: "8990005000024", name: "Gayo Aceh 250g", category: "Biji & Kemasan", price: 11000000, cost: 7000000, stock: 12, lowStockAt: 4, unit: "bag" },
  { sku: "BJI-TUM", barcode: "8990005000031", name: "Tumbler Senja", category: "Biji & Kemasan", price: 13500000, cost: 8000000, stock: 3, lowStockAt: 5, unit: "pcs" },
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