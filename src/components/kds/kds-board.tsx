"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setKitchenStatusAction } from "@/lib/actions/kitchen";
import { formatTime } from "@/lib/money";

export type KdsOrder = {
  id: number;
  number: string;
  orderType: "dine_in" | "takeaway";
  tableLabel: string | null;
  status: string;
  kitchenStatus: "preparing" | "ready" | "served";
  createdAt: string;
  note: string | null;
  items: { name: string; qty: number; note: string | null }[];
};

export function KdsBoard({ orders }: { orders: KdsOrder[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  // Antrian dapur hidup: refresh data tiap 10 detik, detik berjalan tiap 30s.
  useEffect(() => {
    const data = window.setInterval(() => {
      startTransition(() => router.refresh());
    }, 10_000);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearInterval(data);
      window.clearInterval(tick);
    };
  }, [router, startTransition]);

  function setStatus(orderId: number, status: "ready" | "served") {
    startTransition(async () => {
      const result = await setKitchenStatusAction(orderId, status);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (orders.length === 0) {
    return (
      <div className="border border-dashed px-6 py-16 text-center">
        <UtensilsCrossed className="mx-auto size-6 text-muted-foreground" strokeWidth={1.4} />
        <p className="mt-3 font-serif text-xl">Dapur bersih</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Tidak ada pesanan menunggu. Layar menyegarkan otomatis tiap 10 detik.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {orders.map((order) => {
        const minutes = Math.max(0, Math.round((now - new Date(order.createdAt).getTime()) / 60_000));
        return (
          <article
            key={order.id}
            className={cn(
              "flex flex-col border bg-card",
              order.kitchenStatus === "ready"
                ? "border-signal/50"
                : minutes >= 10
                  ? "border-destructive/40"
                  : "border-border",
            )}
          >
            <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <p className="font-mono text-sm">{order.number}</p>
                <p className="text-[11px] text-muted-foreground">
                  {order.orderType === "takeaway" ? "Bungkus" : "Dine-in"}
                  {order.tableLabel ? ` · ${order.tableLabel}` : ""}
                  {order.status === "open" ? " · belum bayar" : ""}
                </p>
              </div>
              <span
                className={cn(
                  "flex items-center gap-1 font-mono text-xs",
                  minutes >= 10 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <Clock className="size-3.5" />
                {minutes}m
              </span>
            </header>

            <ul className="flex-1 divide-y divide-dashed divide-border/70">
              {order.items.map((item, index) => (
                <li key={index} className="flex items-baseline gap-2 px-4 py-2 text-sm">
                  <span className="font-mono text-sm font-semibold">{item.qty}×</span>
                  <span className="min-w-0 flex-1">
                    {item.name}
                    {item.note ? (
                      <span className="block text-[11px] text-signal">{item.note}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>

            {order.note ? (
              <p className="border-t border-dashed px-4 py-2 text-[11px] text-muted-foreground">
                {order.note}
              </p>
            ) : null}

            <footer className="flex gap-1.5 border-t border-border p-3">
              {order.kitchenStatus === "preparing" ? (
                <Button
                  size="sm"
                  className="flex-1 bg-signal text-signal-foreground hover:bg-signal/90"
                  onClick={() => setStatus(order.id, "ready")}
                >
                  <Check /> Siap
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStatus(order.id, "served")}
                >
                  Sudah diangkat · {formatTime(new Date(order.createdAt))}
                </Button>
              )}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
