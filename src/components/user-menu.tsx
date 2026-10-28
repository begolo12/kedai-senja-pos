"use client";

import { useTransition } from "react";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeraMark } from "@/components/brand";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarNav } from "@/components/nav";
import { logoutAction } from "@/lib/actions/auth";

export function UserMenu({
  name,
  username,
  role,
}: {
  name: string;
  username: string;
  role: "admin" | "cashier";
}) {
  const [pending, startTransition] = useTransition();
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-2 border border-border/70 bg-card px-1.5 py-1 text-sm transition-colors hover:bg-muted"
          />
        }
      >
        <span className="grid size-7 place-items-center bg-primary text-[11px] font-semibold text-primary-foreground">
          {initials}
        </span>
        <span className="hidden pr-1 text-left leading-tight sm:block">
          <span className="block text-[13px]">{name}</span>
          <span className="block text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            {role === "admin" ? "Manajemen" : "Kasir"}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block text-sm">{name}</span>
            <span className="block font-mono text-[11px] text-muted-foreground">@{username}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onClick={() => startTransition(() => logoutAction())}
        >
          <LogOut /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MobileNav({ role }: { role: "admin" | "cashier" }) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" size="icon" className="lg:hidden" aria-label="Buka menu" />
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
            Point of sale
          </p>
        </SheetHeader>
        <div className="px-3 py-4">
          <SidebarNav role={role} />
        </div>
      </SheetContent>
    </Sheet>
  );
}