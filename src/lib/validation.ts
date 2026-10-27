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
      }),
    )
    .min(1, "Keranjang kosong.")
    .max(100),
  discountType: z.enum(["amount", "percent"]).nullable(),
  discountValue: z.number().int().min(0),
  paymentMethod: z.enum(["cash", "card", "qris"]),
  amountPaid: z.number().int().min(0),
  customerId: z.number().int().positive().nullable(),
  note: z.string().trim().max(200).optional().or(z.literal("")),
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
  pointsPerAmount: z.number().int().min(0),
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
});