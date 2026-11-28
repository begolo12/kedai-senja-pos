import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TeraMark } from "@/components/brand";
import { defaultRouteForRole, requireStore } from "@/lib/auth";
import { getOpenShift } from "@/lib/shifts";
import { getSettings } from "@/lib/settings";
import { formatDate, formatMoney } from "@/lib/money";
import { formatExpiryDate, getSubscriptionInfo } from "@/lib/subscription";
import { SidebarNav } from "@/components/nav";
import { MobileNav, UserMenu } from "@/components/user-menu";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, store } = await requireStore();
  const settings = await getSettings(store.id);
  const canShift = user.role !== "kitchen";
  const shift = canShift ? await getOpenShift(user.id, store.id) : null;
  const sub = getSubscriptionInfo(user);

  return (
    <div className="flex min-h-dvh flex-1 bg-background">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="border-b border-sidebar-border px-5 py-6">
          <Link href={defaultRouteForRole(user.role)} className="block">
            <span className="flex items-center gap-2 text-[10px] tracking-[0.22em] text-sidebar-foreground/70 uppercase">
              <TeraMark className="size-6 rounded-[3px] object-cover" />
              Tera POS
            </span>
            <span className="mt-2 block font-serif text-[26px] leading-none">
              {settings.storeName}
            </span>
          </Link>
          <Link
            href="/select-store"
            className="mt-2 inline-block text-[10px] tracking-[0.14em] text-sidebar-foreground/60 uppercase underline-offset-4 hover:text-sidebar-foreground hover:underline"
          >
            Ganti toko
          </Link>
        </div>

        <div className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav role={user.role} />
        </div>

        {canShift ? (
          <div className="border-t border-sidebar-border p-3">
            {shift ? (
              <Link
                href="/shift"
                className="block border border-sidebar-border/80 px-3 py-2.5 transition-colors hover:bg-sidebar-accent"
              >
                <span className="flex items-center justify-between text-[10px] tracking-[0.16em] uppercase">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-sidebar-primary" />
                    Shift terbuka
                  </span>
                  <ArrowUpRight className="size-3.5 opacity-60" />
                </span>
                <span className="mt-1.5 block font-mono text-xs text-sidebar-foreground/70">
                  Kas awal {formatMoney(shift.openingFloat, settings.currency)}
                </span>
              </Link>
            ) : (
              <Link
                href="/shift"
                className="flex items-center justify-between border border-sidebar-primary/60 bg-sidebar-accent px-3 py-2.5 text-xs transition-colors hover:bg-sidebar-accent/70"
              >
                Buka shift dulu
                <ArrowUpRight className="size-3.5" />
              </Link>
            )}
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/80 bg-background/85 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <MobileNav role={user.role} />
            <p className="min-w-0 truncate text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              <Link href="/select-store" className="text-foreground/80 hover:underline">
                {store.name}
              </Link>
              <span className="mx-2 text-border">/</span>
              {formatDate(new Date())}
              <span className="mx-2 text-border">/</span>
              <span className="text-foreground/70">Kasir {user.name.split(" ")[0]}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {user.role === "admin" ? (
              <Link
                href="/admin"
                className="stamp border-signal/50 text-signal hover:bg-signal/10"
              >
                Back Office
              </Link>
            ) : null}
            {user.username === "demo" ? (
              <span className="stamp border-signal/50 bg-signal/10 text-signal">Demo</span>
            ) : null}
            {canShift ? (
              !shift ? (
                <span className="stamp border-destructive/40 text-destructive">Shift tutup</span>
              ) : (
                <span className="stamp hidden border-border text-muted-foreground sm:inline-flex">
                  <span className="size-1.5 rounded-full bg-signal" />
                  Sejak {new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(shift.openedAt)}
                </span>
              )
            ) : null}
            <UserMenu name={user.name} username={user.username} role={user.role} />
          </div>
        </header>

        <main className="flex-1 px-4 py-7 sm:px-6 lg:px-8">
          {sub.status === "expiring" && sub.daysLeft !== null ? (
            <div className="mx-auto mb-5 max-w-6xl border border-signal/40 bg-signal/10 px-4 py-2.5 text-xs text-foreground">
              <span className="font-medium text-signal">Masa aktif hampir berakhir:</span>{" "}
              tersisa {sub.daysLeft} hari (berakhir {formatExpiryDate(user.expiresAt)}). Hubungi admin untuk perpanjangan.
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}