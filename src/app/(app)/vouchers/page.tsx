import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { vouchers } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/shared/page-header";
import { VoucherToggle } from "@/components/vouchers/voucher-toggle";
import { VoucherDialog } from "@/components/vouchers/voucher-dialog";

export const metadata: Metadata = { title: "Promo" };

export default async function VouchersPage() {
  const { store } = await requireAdmin();
  const rows = await db
    .select()
    .from(vouchers)
    .where(eq(vouchers.storeId, store.id))
    .orderBy(desc(vouchers.createdAt));
  const stats = (
    await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`sum(case when ${vouchers.active} = true then 1 else 0 end)`,
        used: sql<number>`coalesce(sum(${vouchers.usedCount}), 0)`,
      })
      .from(vouchers)
      .where(eq(vouchers.storeId, store.id))
  )[0]!;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Penjualan"
        title="Promo"
        description="Voucher kode untuk diskon checkout. Periode, syarat belanja, dan kuota divalidasi server saat dipakai."
        actions={<VoucherDialog />}
      />

      <section className="grid gap-px border border-border bg-border sm:grid-cols-3">
        <Stat label="Voucher" value={String(stats.total)} />
        <Stat label="Aktif" value={String(stats.active ?? 0)} />
        <Stat label="Total terpakai" value={String(stats.used ?? 0)} />
      </section>

      {rows.length === 0 ? (
        <section className="border border-dashed px-6 py-14 text-center">
          <p className="font-serif text-xl">Belum ada voucher</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Buat voucher pertama: kode diskon untuk promo berbatas waktu atau kuota.
          </p>
        </section>
      ) : (
        <section className="overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                <th className="px-4 py-2.5 font-medium">Kode</th>
                <th className="px-4 py-2.5 font-medium">Diskon</th>
                <th className="px-4 py-2.5 font-medium">Syarat</th>
                <th className="px-4 py-2.5 font-medium">Periode</th>
                <th className="px-4 py-2.5 text-center font-medium">Terpakai</th>
                <th className="px-4 py-2.5 text-center font-medium">Aktif</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((voucher) => (
                <tr key={voucher.id} className="border-b border-border/70 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-mono text-[13px]">{voucher.code}</span>
                    {voucher.label ? (
                      <span className="block text-[11px] text-muted-foreground">{voucher.label}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono tabular">
                    {voucher.type === "percent"
                      ? `${voucher.value}%`
                      : formatMoney(voucher.value, "IDR")}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {voucher.minSubtotal > 0
                      ? `min. ${formatMoney(voucher.minSubtotal, "IDR")}`
                      : "tanpa syarat"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {voucherPeriod(voucher.startsAt, voucher.endsAt)}
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs tabular">
                    {voucher.usedCount}
                    {voucher.usageLimit > 0 ? ` / ${voucher.usageLimit}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <VoucherToggle id={voucher.id} active={voucher.active} code={voucher.code} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <VoucherDialog
                      voucher={{
                        id: voucher.id,
                        code: voucher.code,
                        label: voucher.label,
                        type: voucher.type,
                        value: voucher.value,
                        minSubtotal: voucher.minSubtotal,
                        startsAt: voucher.startsAt ? toDateInput(voucher.startsAt) : "",
                        endsAt: voucher.endsAt ? toDateInput(voucher.endsAt) : "",
                        usageLimit: voucher.usageLimit,
                        active: voucher.active,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="text-[11px] text-muted-foreground">
        Kasir memasukkan kode di tiket sebelum bayar. Diskon voucher digabung dengan diskon manual
        dan tukar poin; total potongan tidak melebihi subtotal. Kuota dikembalikan bila pesanan
        di-refund.
      </p>
    </div>
  );
}

function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function voucherPeriod(startsAt: Date | null, endsAt: Date | null): string {
  if (startsAt && endsAt) return `${formatDate(startsAt)} — ${formatDate(endsAt)}`;
  if (startsAt) return `mulai ${formatDate(startsAt)}`;
  if (endsAt) return `s.d. ${formatDate(endsAt)}`;
  return "tanpa batas waktu";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-mono text-lg tabular">{value}</p>
    </div>
  );
}
