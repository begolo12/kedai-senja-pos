import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, tiers } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { PageHeader, SectionLabel } from "@/components/shared/page-header";
import { TierDialog } from "@/components/tiers/tier-dialog";

export const metadata: Metadata = { title: "Membership" };

export default async function TiersPage() {
  const { store } = await requireAdmin();
  const settings = await getSettings(store.id);

  const rows = await db
    .select()
    .from(tiers)
    .where(eq(tiers.storeId, store.id))
    .orderBy(asc(tiers.minTotalSpent));

  const memberCount = (
    await db
      .select({ n: sql<number>`count(*)` })
      .from(customers)
      .where(eq(customers.storeId, store.id))
  )[0]?.n;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Loyalitas"
        title="Membership"
        description="Tier otomatis dari total belanja pelanggan. Poin checkout dikalikan kelipatan tier aktif yang paling tinggi ambangnya."
        actions={<TierDialog />}
      />

      <section className="grid gap-px border border-border bg-border sm:grid-cols-2">
        <Stat label="Tier" value={String(rows.length)} />
        <Stat label="Pelanggan terdaftar" value={String(memberCount ?? 0)} />
      </section>

      {rows.length === 0 ? (
        <section className="border border-dashed px-6 py-14 text-center">
          <p className="font-serif text-xl">Belum ada tier</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Buat tier pertama: mis. Silver (1× poin) dan Gold di atas total belanja
            tertentu (1,5× poin).
          </p>
        </section>
      ) : (
        <section className="border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <SectionLabel>Urutan ambang</SectionLabel>
            <h2 className="font-serif text-2xl leading-none">Daftar tier</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th className="px-4 py-2.5 font-medium">Tier</th>
                  <th className="px-4 py-2.5 font-medium">Ambang belanja</th>
                  <th className="px-4 py-2.5 text-center font-medium">Poin</th>
                  <th className="px-4 py-2.5 font-medium">Benefit</th>
                  <th className="px-4 py-2.5 text-center font-medium">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((tier) => (
                  <tr key={tier.id} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-3">{tier.name}</td>
                    <td className="px-4 py-3 font-mono text-xs tabular">
                      {formatMoney(tier.minTotalSpent, settings.currency)}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-xs">
                      {(tier.pointsMultiplier / 100).toLocaleString("id-ID")}×
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {tier.perks || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`stamp ${
                          tier.active
                            ? "border-signal/50 text-signal"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {tier.active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <TierDialog
                        tier={{
                          id: tier.id,
                          name: tier.name,
                          minTotalSpent: tier.minTotalSpent,
                          pointsMultiplier: tier.pointsMultiplier,
                          perks: tier.perks,
                          active: tier.active,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
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
