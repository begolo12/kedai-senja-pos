import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { stores } from "@/lib/db/schema";
import { createOpenOrderInTx } from "@/lib/actions/tables";

export const runtime = "nodejs";

const itemSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.number().int().min(1).max(99),
  note: z.string().trim().max(160).optional(),
});

const payloadSchema = z.object({
  storeCode: z.string().trim().min(1).max(24),
  tableId: z.number().int().positive().nullable().optional(),
  items: z.array(itemSchema).min(1, "Keranjang kosong.").max(60),
});

/** Self-order QR: pelanggan mengirim pesanan; tagihan meja dibuat terbuka. */
export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Pesanan tidak valid." },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const found = await db
    .select({ id: stores.id, taxRate: stores.taxRate })
    .from(stores)
    .where(and(eq(stores.code, data.storeCode.toLowerCase()), eq(stores.active, true)))
    .limit(1);
  const store = found[0];
  if (!store) {
    return Response.json({ error: "Toko tidak ditemukan." }, { status: 404 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const order = await createOpenOrderInTx(tx, {
        storeId: store.id,
        userId: null,
        shiftId: null,
        clientId: crypto.randomUUID(),
        tableId: data.tableId ?? null,
        tableLabel: null,
        note: "Self-order pelanggan",
        items: data.items,
        taxRate: store.taxRate,
      });
      if (!order.ok) return order;
      // Nomor pesanan dari insert pertama sudah cukup; tidak ada retry klien.
      return order;
    });
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json({
      ok: true,
      orderId: result.orderId,
      number: result.number,
      total: result.total,
    });
  } catch {
    return Response.json({ error: "Gagal menyimpan pesanan." }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}
