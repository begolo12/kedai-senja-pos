"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ChartNoAxesColumn,
  ChefHat,
  ChevronDown,
  Clock,
  Crown,
  LayoutDashboard,
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

type NavItem = {
  href: string;
  label: string;
  icon: typeof ShoppingBasket;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
  /** false = hanya admin boleh melihat grup ini */
  forCashier?: boolean;
};

const GROUPS: NavGroup[] = [
  {
    id: "operasional",
    label: "Operasional",
    items: [
      { href: "/", label: "Ringkasan", icon: LayoutDashboard },
      { href: "/pos", label: "Kasir", icon: ShoppingBasket },
      { href: "/kds", label: "Dapur", icon: ChefHat },
      { href: "/orders", label: "Pesanan", icon: ReceiptText },
    ],
  },
  {
    id: "katalog",
    label: "Katalog & stok",
    items: [
      { href: "/products", label: "Produk", icon: Package },
      { href: "/inventory", label: "Stok", icon: Boxes },
      { href: "/purchases", label: "Pembelian", icon: Truck },
    ],
    forCashier: false,
  },
  {
    id: "pelanggan",
    label: "Pelanggan & promo",
    items: [
      { href: "/customers", label: "Pelanggan", icon: UsersRound },
      { href: "/tiers", label: "Membership", icon: Crown },
      { href: "/vouchers", label: "Promo", icon: TicketPercent },
    ],
    forCashier: false,
  },
  {
    id: "wawasan",
    label: "Wawasan",
    items: [
      { href: "/reports", label: "Laporan", icon: ChartNoAxesColumn },
      { href: "/shift", label: "Shift", icon: Clock },
    ],
  },
  {
    id: "toko",
    label: "Toko",
    items: [
      { href: "/tables", label: "Meja", icon: Store },
      { href: "/stores", label: "Cabang", icon: Store },
      { href: "/staff", label: "Staf", icon: UserRoundCog },
      { href: "/settings", label: "Pengaturan", icon: Settings },
    ],
    forCashier: false,
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const STORAGE_KEY = "nav.collapsed.v1";

export function SidebarNav({
  role,
  onNavigate,
}: {
  role: "admin" | "cashier";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = GROUPS.filter((group) => role === "admin" || group.forCashier !== false);

  // Grup aktif selalu terbuka; status grup lain diingat di localStorage.
  const activeGroup = groups.find((group) =>
    group.items.some((item) => isActive(pathname, item.href)),
  )?.id;
  const [collapsed, setCollapsed] = useState<string[]>(() =>
    groups.filter((group) => group.id !== activeGroup).map((group) => group.id),
  );

  useEffect(() => {
    // Pulihkan preferensi collapse pengguna setelah mount (hydration aman).
    let cancelled = false;
    void (async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw || cancelled) return;
        const saved = JSON.parse(raw) as string[];
        if (Array.isArray(saved)) {
          setCollapsed(
            saved.filter((id) => id !== activeGroup && groups.some((g) => g.id === id)),
          );
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* penyimpanan penuh bukan masalah navigasi */
      }
      return next;
    });
  }

  return (
    <nav className="flex flex-col gap-1.5" aria-label="Navigasi utama">
      {groups.map((group) => {
        const isCollapsed = collapsed.includes(group.id);
        return (
          <section key={group.id}>
            <button
              type="button"
              onClick={() => toggle(group.id)}
              aria-expanded={!isCollapsed}
              aria-controls={`nav-group-${group.id}`}
              className="flex w-full items-center justify-between gap-2 px-3 pt-2 pb-1 text-[10px] tracking-[0.16em] text-sidebar-foreground/50 uppercase transition-colors hover:text-sidebar-foreground/80"
            >
              <span>{group.label}</span>
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 transition-transform duration-200",
                  isCollapsed && "-rotate-90",
                )}
              />
            </button>
            <div
              id={`nav-group-${group.id}`}
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <ul className="flex flex-col gap-0.5 pb-1">
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href);
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
              </div>
            </div>
          </section>
        );
      })}
    </nav>
  );
}
