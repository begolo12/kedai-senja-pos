"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Menu, Store, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { TeraMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const ADMIN_ITEMS = [
  { href: "/admin", label: "Ringkasan", icon: LayoutDashboard, exact: true },
  { href: "/admin/accounts", label: "Akun & Langganan", icon: UsersRound, exact: false },
  { href: "/admin/stores", label: "Daftar Toko", icon: Store, exact: false },
];

export function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1" aria-label="Navigasi Back Office">
      <p className="px-3 pt-1 pb-1.5 text-[10px] tracking-[0.16em] text-sidebar-foreground/50 uppercase">
        Back Office
      </p>
      <ul className="flex flex-col gap-0.5">
        {ADMIN_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-sm px-3 py-2 text-[13px] tracking-wide transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-sidebar-primary transition-opacity",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
                <Icon className="size-4 shrink-0" strokeWidth={1.6} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AdminMobileNav() {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" size="icon" className="lg:hidden" aria-label="Buka menu admin" />
        }
      >
        <Menu />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="sidebar-scroll w-72 overflow-y-auto bg-sidebar p-0 text-sidebar-foreground"
      >
        <SheetHeader className="border-b border-sidebar-border px-5 py-5">
          <SheetTitle className="flex items-center gap-2 font-serif text-2xl text-sidebar-foreground">
            <TeraMark className="size-7 rounded-[4px] object-cover" />
            Tera POS
          </SheetTitle>
          <p className="text-[10px] tracking-[0.22em] text-sidebar-foreground/50 uppercase">
            Back Office · Admin
          </p>
        </SheetHeader>
        <div className="px-3 py-4">
          <AdminNav />
        </div>
      </SheetContent>
    </Sheet>
  );
}
