import type { Metadata } from "next";
import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/money";
import { PageHeader } from "@/components/shared/page-header";
import { StaffDialog } from "@/components/staff/staff-dialog";
import { StaffToggle } from "@/components/staff/staff-toggle";

export const metadata: Metadata = { title: "Staf" };

export default async function StaffPage() {
  const me = await requireAdmin();
  const rows = await db.select().from(users).orderBy(asc(users.name));
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
        description="Admin mengatur produk, staf, dan pengaturan. Kasir menjalankan transaksi dan shift."
        actions={<StaffDialog />}
      />

      <section className="grid gap-px border border-border bg-border sm:grid-cols-3">
        <Stat label="Akun" value={String(stats.total)} />
        <Stat label="Aktif" value={String(stats.active ?? 0)} />
        <Stat label="Admin aktif" value={String(stats.admins ?? 0)} />
      </section>

      <section className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">Nama</th>
              <th className="px-4 py-2.5 font-medium">Username</th>
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
                    {staff.role === "admin" ? "Admin" : "Kasir"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <StaffToggle id={staff.id} active={staff.active} name={staff.name} self={staff.id === me.id} />
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(staff.createdAt)}</td>
                <td className="px-4 py-2.5 text-right">
                  <StaffDialog
                    staff={{
                      id: staff.id,
                      name: staff.name,
                      username: staff.username,
                      role: staff.role,
                      active: staff.active,
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-[11px] text-muted-foreground">
        Reset PIN: buka edit pada staf, isi PIN baru, lalu simpan.
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