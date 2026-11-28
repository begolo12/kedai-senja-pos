import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Store as StoreIcon, UsersRound } from "lucide-react";
import { db } from "@/lib/db";
import { orders, stores, userStores, users } from "@/lib/db/schema";
import { requireSuperAdmin, roleLabel } from "@/lib/auth";
import { dayStart } from "@/lib/dates";
import { formatDate } from "@/lib/money";
import { formatExpiryDate, getSubscriptionInfo } from "@/lib/subscription";
import { PageHeader, SectionLabel } from "@/components/shared/page-header";
import { StaffDialog } from "@/components/staff/staff-dialog";
import { RenewDialog } from "@/components/staff/renew-dialog";

export const metadata: Metadata = { title: "Back Office · Admin" };

export default async function AdminOverviewPage() {
  await requireSuperAdmin();

  const [allUsers, allStores, assignments, todayOrderStats] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)),
    db.select().from(stores).orderBy(asc(stores.name)),
    db.select().from(userStores),
    db
      .select({
        count: sql<string>`count(*)`,
      })
      .from(orders)
      .where(and(eq(orders.status, "completed"), gte(orders.createdAt, new Date(dayStart()))))
      .then((rows) => rows[0]),
  ]);

  const storesByUser = new Map<number, string[]>();
  const storeNameById = new Map(allStores.map((s) => [s.id, s.name]));
  for (const row of assignments) {
    const list = storesByUser.get(row.userId) ?? [];
    const name = storeNameById.get(row.storeId);
    if (name) list.push(name);
    storesByUser.set(row.userId, list);
  }

  // Server component: request clock is exact source.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const customers = allUsers.filter((u) => u.role !== "admin");
  const enriched = customers.map((u) => ({
    user: u,
    sub: getSubscriptionInfo(u, now),
    storeNames: storesByUser.get(u.id) ?? [],
  }));

  const activeSubs = enriched.filter(
    (entry) => entry.sub.status === "active" || entry.sub.status === "permanent",
  );
  const expiringSoon = enriched.filter((entry) => entry.sub.status === "expiring");
  const expired = enriched.filter((entry) => entry.sub.status === "expired");
  const attention = [...expired, ...expiringSoon];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Back Office · Tera POS"
        title="Pusat Kontrol Langganan"
        description="Buat ID baru untuk pembeli, pantau masa aktif seluruh pengguna, dan perpanjang periode sewa langsung dari sini."
        actions={<StaffDialog stores={allStores} />}
      />

      <section className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Total ID Pelanggan"
          value={String(customers.length)}
          note={`${allStores.filter((s) => s.active).length} toko aktif · ${todayOrderStats?.count ?? "0"} order hari ini`}
          icon={<UsersRound className="size-4" strokeWidth={1.6} />}
        />
        <Kpi
          label="Langganan Aktif"
          value={String(activeSubs.length)}
          note="Siap dipakai normal (termasuk permanen)"
          icon={<CheckCircle2 className="size-4" strokeWidth={1.6} />}
        />
        <Kpi
          label="Segera Berakhir (≤ 7 hari)"
          value={String(expiringSoon.length)}
          note="Segera ingatkan pelanggan untuk perpanjangan"
          accent={expiringSoon.length > 0}
          icon={<Clock3 className="size-4" strokeWidth={1.6} />}
        />
        <Kpi
          label="Kedaluwarsa"
          value={String(expired.length)}
          note="Login terkunci sampai diperpanjang admin"
          danger={expired.length > 0}
          icon={<AlertTriangle className="size-4" strokeWidth={1.6} />}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section className="min-w-0 border border-border bg-card">
          <div className="flex items-baseline justify-between border-b border-border px-5 py-4">
            <div>
              <SectionLabel>Perlu Perhatian</SectionLabel>
              <h2 className="font-serif text-2xl leading-none">
                Segera Berakhir &amp; Kedaluwarsa
              </h2>
            </div>
            <Link
              href="/admin/accounts"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Semua akun <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {attention.length === 0 ? (
            <p className="px-5 py-10 text-sm text-muted-foreground">
              Semua akun pelanggan masih memiliki masa aktif aman (&gt; 7 hari).
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {attention.map(({ user: account, sub, storeNames }) => (
                <li
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{account.name}</p>
                      <span
                        className={`stamp ${
                          sub.status === "expired"
                            ? "border-destructive/50 text-destructive"
                            : "border-signal/50 text-signal"
                        }`}
                      >
                        {sub.status === "expired"
                          ? "Kedaluwarsa"
                          : `Sisa ${sub.daysLeft} hari`}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      @{account.username} · {storeNames.join(", ") || "Tanpa toko"} · Berakhir{" "}
                      {formatExpiryDate(account.expiresAt)}
                    </p>
                  </div>
                  <RenewDialog
                    userId={account.id}
                    name={account.name}
                    username={account.username}
                    expiresAtIso={account.expiresAt ? account.expiresAt.toISOString() : null}
                    subscriptionNote={account.subscriptionNote}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="min-w-0 border border-border bg-card">
          <div className="flex items-baseline justify-between border-b border-border px-5 py-4">
            <div>
              <SectionLabel>Terbaru</SectionLabel>
              <h2 className="font-serif text-2xl leading-none">ID Pelanggan</h2>
            </div>
            <Link
              href="/admin/stores"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <StoreIcon className="size-3.5" /> Daftar Toko
            </Link>
          </div>
          {enriched.length === 0 ? (
            <p className="px-5 py-10 text-sm text-muted-foreground">
              Belum ada akun pelanggan. Klik &ldquo;Buat ID Baru&rdquo; di kanan atas.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {enriched.slice(0, 6).map(({ user: account, sub, storeNames }) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.name}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      @{account.username} · {roleLabel(account.role)} ·{" "}
                      {storeNames.join(", ") || "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-xs">
                      {sub.status === "permanent"
                        ? "Tanpa batas"
                        : formatExpiryDate(account.expiresAt)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Dibuat {formatDate(account.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  note,
  icon,
  accent,
  danger,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`bg-card px-5 py-5 ${
        danger
          ? "border-t-2 border-t-destructive"
          : accent
            ? "border-t-2 border-t-signal"
            : ""
      }`}
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <p className="text-[11px] tracking-[0.16em] uppercase">{label}</p>
        {icon}
      </div>
      <p className="mt-3 font-mono text-2xl tracking-tight tabular">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}
