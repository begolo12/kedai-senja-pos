import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { shifts, users } from "@/lib/db/schema";
import { requireStore } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getOpenShift, getShiftSummary } from "@/lib/shifts";
import { formatDateTime, formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionLabel } from "@/components/shared/page-header";
import { CloseShiftForm, OpenShiftForm } from "@/components/shift/shift-forms";

export const metadata: Metadata = { title: "Shift" };

export default async function ShiftPage() {
  const { user, store } = await requireStore();
  const settings = await getSettings(store.id);
  const current = await getOpenShift(user.id, store.id);

  const summary = current
    ? await getShiftSummary(current.id, store.id)
    : { orderCount: 0, grossSales: 0, netSales: 0, cashIn: 0, refundTotal: 0, cashRefundOut: 0 };
  const expectedCash = current
    ? current.openingFloat + summary.cashIn - summary.cashRefundOut
    : 0;

  const history = await db
    .select({
      shift: shifts,
      cashier: users.name,
    })
    .from(shifts)
    .innerJoin(users, eq(shifts.userId, users.id))
    .where(
      and(
        eq(shifts.storeId, store.id),
        user.role === "admin" ? undefined : eq(shifts.userId, user.id),
      ),
    )
    .orderBy(desc(shifts.openedAt))
    .limit(12);

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <PageHeader
        eyebrow={`Laci & kas · ${store.name}`}
        title="Shift"
        description="Satu shift per kasir. Tutup shift untuk mencocokkan uang fisik dengan catatan sistem."
      />

      {current ? (
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <section className="border border-border bg-card">
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <SectionLabel>Berjalan sekarang</SectionLabel>
                <h2 className="font-serif text-2xl leading-none">Shift {current.id}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Dibuka {formatDateTime(current.openedAt)} · {user.name}
                </p>
              </div>
              <span className="stamp border-signal/40 text-signal">Terbuka</span>
            </div>
            <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
              <Stat label="Kas awal" value={formatMoney(current.openingFloat, settings.currency)} />
              <Stat label="Penjualan bersih" value={formatMoney(summary.netSales, settings.currency)} />
              <Stat label="Tunai masuk" value={formatMoney(summary.cashIn, settings.currency)} />
              <Stat label="Transaksi" value={String(summary.orderCount)} />
            </dl>
            {summary.cashRefundOut > 0 ? (
              <p className="border-t border-border px-5 py-2 text-[11px] text-muted-foreground">
                Sudah dikurangi refund tunai sebesar{" "}
                <span className="font-mono text-destructive">
                  −{formatMoney(summary.cashRefundOut, settings.currency)}
                </span>{" "}
                dari {formatMoney(summary.refundTotal, settings.currency)} refund.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
              <div>
                <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  Kas seharusnya
                </p>
                <p className="font-mono text-xl">{formatMoney(expectedCash, settings.currency)}</p>
              </div>
              <Button nativeButton={false} render={<Link href="/pos" />} className="bg-signal text-signal-foreground hover:bg-signal/90">
                Lanjut ke kasir
              </Button>
            </div>
          </section>

          <section className="border border-border bg-card px-5 py-5">
            <SectionLabel>Tutup buku</SectionLabel>
            <h2 className="mb-4 font-serif text-2xl leading-none">Hitung uang laci</h2>
            <CloseShiftForm
              expectedCash={expectedCash}
              currency={settings.currency}
              shiftId={current.id}
            />
          </section>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <section className="border border-border bg-card px-5 py-5">
            <SectionLabel>Mulai kerja</SectionLabel>
            <h2 className="mb-1 font-serif text-2xl leading-none">Buka shift</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Kasir mengunci transaksi sampai shift dibuka.
            </p>
            <OpenShiftForm currency={settings.currency} />
          </section>
          <section className="border border-border bg-card p-5">
            <SectionLabel>Kenapa perlu shift?</SectionLabel>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="border-l-2 border-border pl-3">
                Setiap pesanan terhubung ke kasir dan shift, jadi selisih laci bisa
                dilacak ke orang dan jamnya.
              </li>
              <li className="border-l-2 border-border pl-3">
                Refund hanya bisa dilakukan admin, tetapi riwayatnya tetap muncul di
                buku shift kasir asal.
              </li>
              <li className="border-l-2 border-border pl-3">
                Kas awal tidak dihitung sebagai penjualan. Hanya uang tunai dari
                pesanan selesai yang masuk hitungan.
              </li>
            </ul>
          </section>
        </div>
      )}

      <section className="border border-border bg-card">
        <div className="flex items-baseline justify-between border-b border-border px-5 py-4">
          <div>
            <SectionLabel>Riwayat</SectionLabel>
            <h2 className="font-serif text-2xl leading-none">
              {user.role === "admin" ? "Semua shift" : "Shift saya"}
            </h2>
          </div>
          <p className="text-[11px] text-muted-foreground">12 terakhir</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                <th className="px-5 py-2.5 font-medium">Shift</th>
                <th className="px-3 py-2.5 font-medium">Kasir</th>
                <th className="px-3 py-2.5 font-medium">Dibuka</th>
                <th className="px-3 py-2.5 text-right font-medium">Kas awal</th>
                <th className="px-3 py-2.5 text-right font-medium">Seharusnya</th>
                <th className="px-3 py-2.5 text-right font-medium">Dihitung</th>
                <th className="px-5 py-2.5 text-right font-medium">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {history.map(({ shift, cashier }) => {
                const diff =
                  shift.countedCash === null || shift.expectedCash === null
                    ? null
                    : shift.countedCash - shift.expectedCash;
                return (
                  <tr key={shift.id} className="border-b border-border/70 last:border-0">
                    <td className="px-5 py-2.5 font-mono text-xs">#{shift.id}</td>
                    <td className="px-3 py-2.5">{cashier}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDateTime(shift.openedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">
                      {formatMoney(shift.openingFloat, settings.currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">
                      {shift.expectedCash === null
                        ? "—"
                        : formatMoney(shift.expectedCash, settings.currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">
                      {shift.countedCash === null
                        ? "—"
                        : formatMoney(shift.countedCash, settings.currency)}
                    </td>
                    <td
                      className={`px-5 py-2.5 text-right font-mono text-xs ${
                        diff === null || diff === 0
                          ? "text-muted-foreground"
                          : diff > 0
                            ? "text-signal"
                            : "text-destructive"
                      }`}
                    >
                      {diff === null || diff === 0
                        ? "Pas"
                        : `${diff > 0 ? "+" : ""}${formatMoney(diff, settings.currency)}`}
                    </td>
                  </tr>
                );
              })}
              {history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Belum ada shift.
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
      <dt className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 font-mono text-sm tabular">{value}</dd>
    </div>
  );
}