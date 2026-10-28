import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username wajib diisi.").max(40),
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "PIN 4–8 digit angka."),
});

export const productSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80),
  sku: z
    .string()
    .trim()
    .min(2, "SKU minimal 2 karakter.")
    .max(32)
    .regex(/^[A-Za-z0-9-]+$/, "SKU: huruf, angka, atau tanda hubung."),
  barcode: z.string().trim().max(32).optional().or(z.literal("")),
  categoryId: z.number().int().positive().nullable(),
  price: z.number().int().min(0, "Harga tidak boleh negatif."),
  cost: z.number().int().min(0, "Modal tidak boleh negatif."),
  stock: z.number().int().min(0, "Stok tidak boleh negatif."),
  lowStockAt: z.number().int().min(0).max(9999),
  unit: z.string().trim().min(1).max(12),
  options: z.string().trim().max(300).optional().or(z.literal("")),
  active: z.boolean(),
});

export const categorySchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "Nama kategori minimal 2 karakter.").max(40),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format #rrggbb."),
  sortOrder: z.number().int().min(0).max(999),
});

export const customerSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+\-\s]*$/, "Nomor telepon tidak valid.")
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(120)
    .email("Email tidak valid.")
    .optional()
    .or(z.literal("")),
});

export const stockAdjustSchema = z.object({
  productId: z.number().int().positive(),
  delta: z
    .number()
    .int()
    .refine((v) => v !== 0, "Jumlah penyesuaian tidak boleh 0.")
    .refine((v) => Math.abs(v) <= 100000, "Penyesuaian terlalu besar."),
  reason: z.enum(["restock", "correction", "waste"]),
  note: z.string().trim().max(160).optional().or(z.literal("")),
});

export const checkoutSchema = z.object({
  clientId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        qty: z.number().int().min(1).max(999),
        note: z.string().trim().max(160).optional().or(z.literal("")),
      }),
    )
    .min(1, "Keranjang kosong.")
    .max(100),
  discountType: z.enum(["amount", "percent"]).nullable(),
  discountValue: z.number().int().min(0),
  orderType: z.enum(["dine_in", "takeaway"]),
  tableLabel: z.string().trim().max(40).optional().or(z.literal("")),
  paymentMethod: z.enum(["cash", "card", "qris"]),
  payments: z
    .array(
      z.object({
        method: z.enum(["cash", "card", "qris"]),
        amount: z.number().int().min(0),
      }),
    )
    .max(4)
    .default([]),
  amountPaid: z.number().int().min(0),
  customerId: z.number().int().positive().nullable(),
  pointsRedeem: z.number().int().min(0).max(100_000).default(0),
  voucherCode: z
    .string()
    .trim()
    .max(32)
    .regex(/^[A-Za-z0-9-]*$/, "Kode voucher: huruf, angka, tanda hubung.")
    .optional()
    .or(z.literal("")),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

export const voucherSchema = z.object({
  id: z.number().int().positive().optional(),
  code: z
    .string()
    .trim()
    .min(2, "Kode minimal 2 karakter.")
    .max(32)
    .regex(/^[A-Za-z0-9-]+$/, "Kode: huruf, angka, tanda hubung.")
    .transform((v) => v.toUpperCase()),
  label: z.string().trim().max(80).optional().or(z.literal("")),
  type: z.enum(["percent", "fixed"]),
  value: z.number().int().min(0),
  minSubtotal: z.number().int().min(0),
  startsAt: z.string().trim().optional().or(z.literal("")),
  endsAt: z.string().trim().optional().or(z.literal("")),
  usageLimit: z.number().int().min(0).max(1_000_000),
  active: z.boolean(),
});
export const supplierSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "Nama supplier minimal 2 karakter.").max(80),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  note: z.string().trim().max(200).optional().or(z.literal("")),
  active: z.boolean(),
});

export const purchaseItemSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.number().int().min(1, "Jumlah minimal 1.").max(10_000),
  unitCost: z.number().int().min(0, "Harga beli tidak boleh negatif."),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.number().int().positive().nullable(),
  note: z.string().trim().max(200).optional().or(z.literal("")),
  expectedAt: z.string().trim().max(10).optional().or(z.literal("")),
  items: z
    .array(purchaseItemSchema)
    .min(1, "PO butuh minimal satu item.")
    .max(100),
});

export const shiftOpenSchema = z.object({
  openingFloat: z.number().int().min(0),
});

export const shiftCloseSchema = z.object({
  checkedCash: z.number().int().min(0),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

export const settingsSchema = z.object({
  storeName: z.string().trim().min(2).max(80),
  address: z.string().trim().max(200),
  phone: z.string().trim().max(40),
  currency: z.enum(["IDR"]),
  taxRate: z.number().int().min(0).max(5000),
  receiptFooter: z.string().trim().max(200),
  receiptWidth: z.enum(["58", "80"]),
  qrisPayload: z.string().trim().max(500_000),
  pointsPerAmount: z.number().int().min(0),
  pointsValue: z.number().int().min(0).max(100_000_000),
});

export const staffSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80),
  username: z
    .string()
    .trim()
    .min(3, "Username minimal 3 karakter.")
    .max(32)
    .regex(/^[a-z0-9._-]+$/, "Username: huruf kecil, angka, titik, garis."),
  role: z.enum(["admin", "cashier"]),
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "PIN 4–8 digit angka.")
    .optional()
    .or(z.literal("")),
  active: z.boolean(),
  storeIds: z.array(z.number().int().positive()).max(50).default([]),
});
export const storeSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "Nama toko minimal 2 karakter.").max(80),
  code: z
    .string()
    .trim()
    .min(2, "Kode toko minimal 2 karakter.")
    .max(24)
    .regex(/^[a-z0-9-]+$/i, "Kode: huruf, angka, tanda hubung."),
  address: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(40).default(""),
  taxRate: z.number().int().min(0).max(5000),
  receiptWidth: z.enum(["58", "80"]),
  active: z.boolean().default(true),
  copyMenu: z.boolean().default(false),
});
