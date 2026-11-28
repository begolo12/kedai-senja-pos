import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { TeraMark } from "@/components/brand";
import { requireSuperAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/money";
import { AdminMobileNav, AdminNav } from "@/components/admin/admin-nav";
import { UserMenu } from "@/components/user-menu";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireSuperAdmin();

  return (
    <div className="flex min-h-dvh flex-1 bg-background">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="border-b border-sidebar-border px-5 py-6">
          <Link href="/admin" className="block">
            <span className="flex items-center gap-2 text-[10px] tracking-[0.22em] text-sidebar-foreground/70 uppercase">
              <TeraMark className="size-6 rounded-[3px] object-cover" />
              Tera POS
            </span>
            <span className="mt-2 block font-serif text-[26px] leading-none">
              Back Office
            </span>
          </Link>
          <p className="mt-2 text-[10px] tracking-[0.14em] text-sidebar-foreground/55 uppercase">
            Manajemen Lisensi &amp; ID
          </p>
        </div>

        <div className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
          <AdminNav />
        </div>

        <div className="border-t border-sidebar-border p-3">
          <div className="border border-sidebar-border/80 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[10px] tracking-[0.16em] text-sidebar-primary uppercase">
              <ShieldCheck className="size-3.5" />
              Admin Utama
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-sidebar-foreground/65">
              Buat ID pelanggan, pantau masa aktif, dan perpanjang langganan.
            </p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/80 bg-background/85 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <AdminMobileNav />
            <p className="min-w-0 truncate text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              <span className="text-foreground/85">Back Office</span>
              <span className="mx-2 text-border">/</span>
              {formatDate(new Date())}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="stamp hidden border-signal/40 text-signal sm:inline-flex">
              Admin
            </span>
            <UserMenu name={user.name} username={user.username} role={user.role} />
          </div>
        </header>

        <main className="flex-1 px-4 py-7 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
