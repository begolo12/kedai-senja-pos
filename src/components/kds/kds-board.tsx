"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Check, Clock, UtensilsCrossed } from "lucide-react";
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
  items: { name: string; qty: number; note: string | null; station: "bar" | "kitchen" }[];
};

type StationFilter = "all" | "bar" | "kitchen";

function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(784, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    /* Web Audio tidak tersedia */
  }
}

export function KdsBoard({ orders }: { orders: KdsOrder[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const [station, setStation] = useState<StationFilter>("all");
  const [soundOn, setSoundOn] = useState(false);
  const seenIds = useRef<Set<number>>(new Set(orders.map((o) => o.id)));

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

  useEffect(() => {
    let hasNew = false;
    for (const order of orders) {
      if (!seenIds.current.has(order.id)) {
        hasNew = true;
        seenIds.current.add(order.id);
      }
    }
    if (hasNew && soundOn) playChime();
  }, [orders, soundOn]);

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

  const visibleOrders = useMemo(() => {
    if (station === "all") return orders;
    return orders
      .map((order) => ({
        ...order,
        items: order.items.filter((item) => item.station === station),
      }))
      .filter((order) => order.items.length > 0);
  }, [orders, station]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter stasiun">
          {(
            [
              { value: "all", label: "Semua stasiun" },
              { value: "bar", label: "Barista" },
              { value: "kitchen", label: "Dapur" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStation(tab.value)}
              aria-pressed={station === tab.value}
              className={cn(
                "h-8 border px-3 text-xs tracking-wide transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                station === tab.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const next = !soundOn;
            setSoundOn(next);
            if (next) playChime();
          }}
          aria-pressed={soundOn}
        >
          {soundOn ? <Bell className="text-signal" /> : <BellOff />}
          {soundOn ? "Suara aktif" : "Suara mati"}
        </Button>
      </div>

      {visibleOrders.length === 0 ? (
        <div className="border border-dashed px-6 py-16 text-center">
          <UtensilsCrossed className="mx-auto size-6 text-muted-foreground" strokeWidth={1.4} />
          <p className="mt-3 font-serif text-xl">Dapur bersih</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tidak ada pesanan menunggu pada stasiun ini. Layar menyegarkan otomatis tiap 10 detik.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleOrders.map((order) => {
            const minutes = Math.max(0, Math.round((now - new Date(order.createdAt).getTime()) / 60_000));
            return (
              <article
                key={order.id}
                className={cn(
                  "flex flex-col border bg-card",
                  order.kitchenStatus === "ready"
                    ? "border-signal/60"
                    : minutes >= 10
                      ? "border-destructive/50"
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
                      <span className="stamp shrink-0 border-border text-muted-foreground">
                        {item.station === "bar" ? "BAR" : "DAPUR"}
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
      )}
    </div>
  );
}
