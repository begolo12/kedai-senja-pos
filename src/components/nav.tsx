"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ChartNoAxesColumn,
  ChefHat,
  Clock,
  Crown,
  Package,
  ReceiptText,
  Settings,
  ShoppingBasket,
  Store,
  TicketPercent,
  Truck,
  UsersRound,
  UserRoundCog,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/pos", label: "Kasir", icon: ShoppingBasket },
  { href: "/kds", label: "Dapur", icon: ChefHat },
  { href: "/orders", label: "Pesanan", icon: ReceiptText },
  { href: "/products", label: "Produk", icon: Package },
  { href: "/inventory", label: "Stok", icon: Boxes },
  { href: "/customers", label: "Pelanggan", icon: UsersRound },
  { href: "/reports", label: "Laporan", icon: ChartNoAxesColumn },
  { href: "/shift", label: "Shift", icon: Clock },
] as const;

const ADMIN_ONLY_NAV = [
  { href: "/vouchers", label: "Promo", icon: TicketPercent },
  { href: "/tiers", label: "Membership", icon: Crown },
  { href: "/purchases", label: "Pembelian", icon: Truck },
  { href: "/tables", label: "Meja", icon: Store },
  { href: "/stores", label: "Toko", icon: Store },
  { href: "/staff", label: "Staf", icon: UserRoundCog },
  { href: "/settings", label: "Pengaturan", icon: Settings },
] as const;

export function SidebarNav({
  role,
  onNavigate,
}: {
  role: "admin" | "cashier";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items =
    role === "admin"
      ? [...NAV, ...ADMIN_ONLY_NAV]
      : NAV.filter(
          (item) => item.href === "/pos" || item.href === "/shift" || item.href === "/kds",
        );

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/pos" && pathname.startsWith(`${item.href}/`));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 px-3 py-2 text-[13px] tracking-wide transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-1.5 left-0 w-[2px] bg-sidebar-primary transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
            />
            <Icon className="size-4 shrink-0" strokeWidth={1.6} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}