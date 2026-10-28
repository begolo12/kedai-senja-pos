import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, purchaseOrderItems, purchaseOrders, suppliers } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatDate, formatDateTime, formatMoney } from "@/lib/money";
import { PageHeader, SectionLabel } from "@/components/shared/page-header";
import { SupplierDialog } from "@/components/purchases/supplier-dialog";
import { PurchaseDialog } from "@/components/purchases/purchase-dialog";
import { PoActions } from "@/components/purchases/po-actions";

export const metadata: Metadata = { title: "Pembelian" };

const STATUS_LABEL: Record<string, string> = {
  ordered: "Dipesan",
  received: "Diterima",
  cancelled: "Dibatalkan",
};

export default async function PurchasesPage() {
  const { store } = await requireAdmin();
  const settings = await getSettings(store.id);

  const [supplierRows, poRows, itemCounts, productRows] = await Promise.all([
    db
      .select()
      .from(suppliers)
      .where(eq(suppliers.storeId, store.id))
      .orderBy(desc(suppliers.active), suppliers.name),
    db
      .select({
        po: purchaseOrders,
        supplierName: suppliers.name,
        itemCount: sql<number>`(select count(*) from ${purchaseOrderItems} where ${purchaseOrderItems.purchaseOrderId} = ${purchaseOrders.id})`,
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(eq(purchaseOrders.storeId, store.id))
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(50),
    db
      .select({
        purchaseOrderId: purchaseOrderItems.purchaseOrderId,
        items: sql<number>`count(*)`,
        qty: sql<number>`coalesce(sum(${purchaseOrderItems.qty}), 0)`,
      })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
      .where(eq(purchaseOrders.storeId, store.id))
      .groupBy(purchaseOrderItems.purchaseOrderId),
    db
      .select({
        id: products.id,
        name: products.name,
        unit: products.unit,
        cost: products.cost,
        stock: products.stock,
      })
      .from(products)
      .where(eq(products.storeId, store.id))
      .orderBy(products.name),
  ]);

  const itemMap = new Map(itemCounts.map((row) => [row.purchaseOrderId, row]));
  const outstanding = poRows.filter((row) => row.po.status === "ordered");
  const outstandingCost = outstanding.reduce((sum, row) => sum + row.po.totalCost, 0);
  const activeSuppliers = supplierRows.filter((s) => s.active).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow={`Persediaan · ${store.name}`}
        title="Pembelian"
        description="Purchase order ke supplier. Stok bertambah otomatis saat PO diterima, tercatat sebagai movement restock."
        actions={
          <>
            <PurchaseDialog
              products={productRows}
              suppliers={supplierRows.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))}
              currency={settings.currency}
            />
            <SupplierDialog />
          </>
        }
      />

      <section className="grid gap-px border border-border bg-border sm:grid-cols-3">
        <Stat label="PO belum diterima" value={String(outstanding.length)} />
        <Stat label="Nilai dipesan" value={formatMoney(outstandingCost, settings.currency)} />
        <Stat label="Supplier aktif" value={String(activeSuppliers)} />
      </section>

      <section className="border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <SectionLabel>Pesanan pembelian</SectionLabel>
          <h2 className="font-serif text-2xl leading-none">Purchase order</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                <th className="px-5 py-2.5 font-medium">PO</th>
                <th className="px-3 py-2.5 font-medium">Supplier</th>
                <th className="px-3 py-2.5 font-medium">Dibuat</th>
                <th className="px-3 py-2.5 font-medium">Estimasi</th>
                <th className="px-3 py-2.5 text-center font-medium">Item</th>
                <th className="px-3 py-2.5 text-right font-medium">Biaya</th>
                <th className="px-3 py-2.5 text-center font-medium">Status</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {poRows.map(({ po, supplierName, itemCount }) => {
                const items = itemMap.get(po.id);
                return (
                  <tr key={po.id} className="border-b border-border/70 last:border-0">
                    <td className="px-5 py-3 font-mono text-xs">
                      #{po.id}
                      {po.note ? (
                        <span className="block max-w-40 truncate text-[10px] text-muted-foreground">
                          {po.note}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-xs">{supplierName ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {formatDateTime(po.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {po.expectedAt ? formatDate(po.expectedAt) : "—"}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-xs">
                      {Number(itemCount ?? items?.items ?? 0)} baris
                      <span className="ml-1 text-muted-foreground">
                        ({Number(items?.qty ?? 0)} unit)
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs tabular">
                      {formatMoney(po.totalCost, settings.currency)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`stamp ${
                          po.status === "received"
                            ? "border-border text-muted-foreground"
                            : po.status === "cancelled"
                              ? "border-destructive/40 text-destructive"
                              : "border-signal/50 text-signal"
                        }`}
                      >
                        {STATUS_LABEL[po.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <PoActions id={po.id} status={po.status} />
                    </td>
                  </tr>
                );
              })}
              {poRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Belum ada purchase order. Buat PO untuk mencatat pesanan ke supplier.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <SectionLabel>Mitra</SectionLabel>
          <h2 className="font-serif text-2xl leading-none">Supplier</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                <th className="px-5 py-2.5 font-medium">Nama</th>
                <th className="px-3 py-2.5 font-medium">Telepon</th>
                <th className="px-3 py-2.5 font-medium">Catatan</th>
                <th className="px-3 py-2.5 text-center font-medium">Aktif</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {supplierRows.map((supplier) => (
                <tr key={supplier.id} className="border-b border-border/70 last:border-0">
                  <td className="px-5 py-3">{supplier.name}</td>
                  <td className="px-3 py-3 font-mono text-xs">{supplier.phone || "—"}</td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {supplier.note || "—"}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={`stamp ${
                        supplier.active
                          ? "border-signal/50 text-signal"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {supplier.active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <SupplierDialog
                      supplier={{
                        id: supplier.id,
                        name: supplier.name,
                        phone: supplier.phone,
                        note: supplier.note,
                        active: supplier.active,
                      }}
                    />
                  </td>
                </tr>
              ))}
              {supplierRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Belum ada supplier. Tambahkan supplier untuk catatan pembelian.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-mono text-lg tabular">{value}</p>
    </div>
  );
}
