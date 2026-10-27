import type { Metadata } from "next";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatDate, formatMoney } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { CustomerDialog } from "@/components/customers/customer-dialog";

export const metadata: Metadata = { title: "Pelanggan" };

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const { store } = await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const settings = await getSettings(store.id);

  const rows = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.storeId, store.id),
        q ? or(like(customers.name, `%${q}%`), like(customers.phone, `%${q}%`)) : undefined,
      ),
    )
    .orderBy(desc(customers.totalSpent));

  const stats = (await db
    .select({
      total: sql<number>`count(*)`,
      points: sql<number>`coalesce(sum(${customers.points}), 0)`,
      spent: sql<number>`coalesce(sum(${customers.totalSpent}), 0)`,
      repeat: sql<number>`sum(case when ${customers.totalSpent} > 0 then 1 else 0 end)`,
    })
    .from(customers)
    .where(eq(customers.storeId, store.id))
    )[0]!;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Relasi"
        title="Pelanggan"
        description="Poin otomatis dari total belanja. Pilih pelanggan di kasir untuk mengumpulkan poin."
        actions={<CustomerDialog />}
      />

      <section className="grid gap-px border border-border bg-border sm:grid-cols-4">
        <Stat label="Pelanggan" value={String(stats.total)} />
        <Stat label="Pernah belanja" value={String(stats.repeat ?? 0)} />
        <Stat label="Poin beredar" value={new Intl.NumberFormat("id-ID").format(Number(stats.points))} />
        <Stat label="Total belanja" value={formatMoney(Number(stats.spent), settings.currency)} />
      </section>

      <form className="flex items-end gap-2 border border-border bg-card px-3 py-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="mb-1 block text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Cari
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="Nama atau nomor telepon" className="h-8" />
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-8">
          Terapkan
        </Button>
      </form>

      <section className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">Nama</th>
              <th className="px-4 py-2.5 font-medium">Kontak</th>
              <th className="px-4 py-2.5 text-right font-medium">Poin</th>
              <th className="px-4 py-2.5 text-right font-medium">Total belanja</th>
              <th className="px-4 py-2.5 font-medium">Sejak</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((customer, index) => (
              <tr key={customer.id} className="border-b border-border/70 last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 shrink-0 place-items-center bg-muted font-mono text-[10px] text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="font-medium">{customer.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  <p className="font-mono">{customer.phone ?? "—"}</p>
                  <p className="truncate">{customer.email ?? ""}</p>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">{customer.points}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">
                  {formatMoney(customer.totalSpent, settings.currency)}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(customer.createdAt)}</td>
                <td className="px-4 py-2.5 text-right">
                  <CustomerDialog
                    customer={{
                      id: customer.id,
                      name: customer.name,
                      phone: customer.phone,
                      email: customer.email,
                    }}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Belum ada pelanggan.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
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