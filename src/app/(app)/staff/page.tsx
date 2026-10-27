import type { Metadata } from "next";
import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { stores, userStores, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/money";
import { PageHeader } from "@/components/shared/page-header";
import { StaffDialog } from "@/components/staff/staff-dialog";
import { StaffToggle } from "@/components/staff/staff-toggle";
import { PinDialog } from "@/components/staff/pin-dialog";

export const metadata: Metadata = { title: "Staf" };

export default async function StaffPage() {
  const { user: me } = await requireAdmin();
  const rows = await db.select().from(users).orderBy(asc(users.name));
  const allStores = await db.select().from(stores).orderBy(asc(stores.name));
  const assignments = await db.select().from(userStores);
  const storesByUser = new Map<number, number[]>();
  for (const assignment of assignments) {
    const list = storesByUser.get(assignment.userId) ?? [];
    list.push(assignment.storeId);
    storesByUser.set(assignment.userId, list);
  }
  const stats = (await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`sum(case when ${users.active} = true then 1 else 0 end)`,
      admins: sql<number>`sum(case when ${users.role} = 'admin' and ${users.active} = true then 1 else 0 end)`,
    })
    .from(users)
    )[0]!;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Tim"
        title="Staf"
        description="Manajemen mengatur produk, akun, PIN, dan pengaturan. Kasir menjalankan transaksi dan shift."
        actions={<StaffDialog stores={allStores} />}
      />

      <section className="grid gap-px border border-border bg-border sm:grid-cols-3">
        <Stat label="Akun" value={String(stats.total)} />
        <Stat label="Aktif" value={String(stats.active ?? 0)} />
        <Stat label="Manajemen aktif" value={String(stats.admins ?? 0)} />
      </section>

      <section className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">Nama</th>
              <th className="px-4 py-2.5 font-medium">ID Login</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 text-center font-medium">Aktif</th>
              <th className="px-4 py-2.5 font-medium">Dibuat</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((staff) => (
              <tr key={staff.id} className="border-b border-border/70 last:border-0">
                <td className="px-4 py-2.5">
                  {staff.name}
                  {staff.id === me.id ? (
                    <span className="ml-2 stamp border-signal/40 text-signal">Kamu</span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">@{staff.username}</td>
                <td className="px-4 py-2.5">
                  <span className="stamp border-border text-muted-foreground">
                    {staff.role === "admin" ? "Manajemen" : "Kasir"}
                    {staff.role === "cashier" ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {allStores
                          .filter((store) => storesByUser.get(staff.id)?.includes(store.id))
                          .map((store) => store.name)
                          .join(", ") || "belum ada toko"}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <StaffToggle id={staff.id} active={staff.active} name={staff.name} self={staff.id === me.id} />
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(staff.createdAt)}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-1">
                  <PinDialog
                    staff={{
                      id: staff.id,
                      name: staff.name,
                      username: staff.username,
                      role: staff.role,
                      active: staff.active,
                      storeIds: storesByUser.get(staff.id) ?? [],
                    }}
                  />
                  <StaffDialog
                    stores={allStores}
                    staff={{
                      id: staff.id,
                      name: staff.name,
                      username: staff.username,
                      role: staff.role,
                      active: staff.active,
                      storeIds: storesByUser.get(staff.id) ?? [],
                    }}
                  />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-[11px] text-muted-foreground">
        Tidak ada password. Login memakai ID + PIN. Gunakan tombol PIN untuk mengganti PIN tanpa mengubah data lain.
      </p>
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