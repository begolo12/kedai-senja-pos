import Link from "next/link";
import { ArrowUpRight, AudioLines } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getOpenShift } from "@/lib/shifts";
import { getSettings } from "@/lib/settings";
import { formatDate, formatMoney } from "@/lib/money";
import { SidebarNav } from "@/components/nav";
import { MobileNav, UserMenu } from "@/components/user-menu";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const settings = await getSettings();
  const shift = await getOpenShift(user.id);

  return (
    <div className="flex min-h-dvh flex-1 bg-background">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="border-b border-sidebar-border px-5 py-6">
          <Link href="/" className="block">
            <span className="flex items-center gap-2 text-[10px] tracking-[0.22em] text-sidebar-foreground/70 uppercase">
              <AudioLines className="size-3.5" strokeWidth={1.8} />
              Point of sale
            </span>
            <span className="mt-2 block font-serif text-[26px] leading-none">
              {settings.storeName}
            </span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav role={user.role} />
        </div>

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
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/80 bg-background/85 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex items-center gap-3">
            <MobileNav role={user.role} />
            <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              {formatDate(new Date())}
              <span className="mx-2 text-border">/</span>
              <span className="text-foreground/70">Kasir {user.name.split(" ")[0]}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!shift ? (
              <span className="stamp border-destructive/40 text-destructive">Shift tutup</span>
            ) : (
              <span className="stamp hidden border-border text-muted-foreground sm:inline-flex">
                <span className="size-1.5 rounded-full bg-signal" />
                Sejak {new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(shift.openedAt)}
              </span>
            )}
            <UserMenu name={user.name} username={user.username} role={user.role} />
          </div>
        </header>

        <main className="flex-1 px-4 py-7 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}