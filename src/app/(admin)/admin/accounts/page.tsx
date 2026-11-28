import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { stores, userStores, users } from "@/lib/db/schema";
import { requireSuperAdmin, roleLabel } from "@/lib/auth";
import { formatDate } from "@/lib/money";
import {
  formatExpiryDate,
  getSubscriptionInfo,
  type SubscriptionStatus,
} from "@/lib/subscription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { StaffDialog } from "@/components/staff/staff-dialog";
import { StaffToggle } from "@/components/staff/staff-toggle";
import { PinDialog } from "@/components/staff/pin-dialog";
import { RenewDialog } from "@/components/staff/renew-dialog";

export const metadata: Metadata = { title: "Akun & Langganan · Back Office" };

type FilterKey = "all" | SubscriptionStatus;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "active", label: "Aktif" },
  { key: "expiring", label: "Segera berakhir" },
  { key: "expired", label: "Kedaluwarsa" },
  { key: "permanent", label: "Permanen" },
  { key: "inactive", label: "Nonaktif" },
];

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { user: me } = await requireSuperAdmin();
  const params = await searchParams;
  const activeFilter: FilterKey = FILTERS.some((f) => f.key === params.status)
    ? (params.status as FilterKey)
    : "all";
  const q = (params.q ?? "").trim().toLowerCase();

  const [rows, allStores, assignments] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt), asc(users.name)),
    db.select().from(stores).orderBy(asc(stores.name)),
    db.select().from(userStores),
  ]);

  const storesByUser = new Map<number, number[]>();
  const storeNameById = new Map(allStores.map((s) => [s.id, s.name]));
  for (const assignment of assignments) {
    const list = storesByUser.get(assignment.userId) ?? [];
    list.push(assignment.storeId);
    storesByUser.set(assignment.userId, list);
  }

  // Server component: request clock is exact source.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const enriched = rows.map((row) => {
    const storeIds = storesByUser.get(row.id) ?? [];
    const storeNames = storeIds.map((id) => storeNameById.get(id)).filter(Boolean) as string[];
    return {
      row,
      storeIds,
      storeNames,
      sub: getSubscriptionInfo(row, now),
    };
  });

  const filtered = enriched.filter(({ row, storeNames, sub }) => {
    if (activeFilter !== "all" && sub.status !== activeFilter) return false;
    if (!q) return true;
    return (
      row.name.toLowerCase().includes(q) ||
      row.username.toLowerCase().includes(q) ||
      row.subscriptionNote.toLowerCase().includes(q) ||
      storeNames.some((name) => name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Back Office · Manajemen ID"
        title="Akun & Langganan"
        description="Hanya Admin Utama yang bisa membuat ID baru, mengatur masa aktif (bulan/tahun), dan memperpanjang akses pelanggan."
        actions={<StaffDialog stores={allStores} />}
      />

      <section className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card p-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((filter) => {
            const count =
              filter.key === "all"
                ? enriched.length
                : enriched.filter((item) => item.sub.status === filter.key).length;
            const selected = activeFilter === filter.key;
            const href =
              filter.key === "all"
                ? q
                  ? `/admin/accounts?q=${encodeURIComponent(q)}`
                  : "/admin/accounts"
                : `/admin/accounts?status=${filter.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
            return (
              <Link
                key={filter.key}
                href={href}
                className={`border px-2.5 py-1 text-xs transition-colors ${
                  selected
                    ? "border-signal bg-signal/15 text-signal"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {filter.label} ({count})
              </Link>
            );
          })}
        </div>
        <form action="/admin/accounts" className="flex items-center gap-2">
          {activeFilter !== "all" ? (
            <input type="hidden" name="status" value={activeFilter} />
          ) : null}
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Cari nama, ID, toko, catatan"
            className="h-8 w-56 text-xs"
          />
          <Button type="submit" variant="outline" size="sm" className="h-8">
            Cari
          </Button>
        </form>
      </section>

      <section className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">Nama &amp; ID</th>
              <th className="px-4 py-2.5 font-medium">Akses &amp; Toko</th>
              <th className="px-4 py-2.5 font-medium">Masa Aktif</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-center font-medium">Aktif</th>
              <th className="px-4 py-2.5 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Tidak ada akun yang cocok dengan filter ini.
                </td>
              </tr>
            ) : (
              filtered.map(({ row: account, storeIds, storeNames, sub }) => (
                <tr key={account.id} className="border-b border-border/70 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{account.name}</span>
                      {account.id === me.id ? (
                        <span className="stamp border-signal/40 text-signal">Kamu</span>
                      ) : null}
                      {account.username === "demo" ? (
                        <span className="stamp border-border text-muted-foreground">Demo</span>
                      ) : null}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">@{account.username}</p>
                    {account.subscriptionNote ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {account.subscriptionNote}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className="stamp border-border text-muted-foreground">
                      {roleLabel(account.role)}
                    </span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {account.role === "admin"
                        ? "Back Office · Semua toko"
                        : storeNames.join(", ") || "belum ada toko"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs">
                      {account.role === "admin" || !account.expiresAt
                        ? "Tanpa batas"
                        : `s.d. ${formatExpiryDate(account.expiresAt)}`}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Dibuat {formatDate(account.createdAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {sub.status === "inactive" ? (
                      <span className="stamp border-border text-muted-foreground">Nonaktif</span>
                    ) : sub.status === "permanent" ? (
                      <span className="stamp border-border text-muted-foreground">Permanen</span>
                    ) : sub.status === "expired" ? (
                      <span className="stamp border-destructive/50 text-destructive">
                        Kedaluwarsa
                      </span>
                    ) : sub.status === "expiring" ? (
                      <span className="stamp border-signal/50 text-signal">
                        Sisa {sub.daysLeft} hari
                      </span>
                    ) : (
                      <span className="stamp border-signal/40 text-signal">
                        Aktif ({sub.daysLeft} hr)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StaffToggle
                      id={account.id}
                      active={account.active}
                      name={account.name}
                      self={account.id === me.id}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {account.role !== "admin" ? (
                        <RenewDialog
                          userId={account.id}
                          name={account.name}
                          username={account.username}
                          expiresAtIso={account.expiresAt ? account.expiresAt.toISOString() : null}
                          subscriptionNote={account.subscriptionNote}
                          compact
                        />
                      ) : null}
                      <PinDialog
                        staff={{
                          id: account.id,
                          name: account.name,
                          username: account.username,
                          role: account.role,
                          active: account.active,
                          storeIds,
                          subscriptionNote: account.subscriptionNote,
                        }}
                      />
                      <StaffDialog
                        stores={allStores}
                        staff={{
                          id: account.id,
                          name: account.name,
                          username: account.username,
                          role: account.role,
                          active: account.active,
                          storeIds,
                          subscriptionNote: account.subscriptionNote,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <p className="text-[11px] text-muted-foreground">
        Perpanjangan pada akun yang masih aktif akan disambung otomatis dari tanggal berakhirnya;
        pada akun yang sudah kedaluwarsa akan dihitung mulai hari ini.
      </p>
    </div>
  );
}
