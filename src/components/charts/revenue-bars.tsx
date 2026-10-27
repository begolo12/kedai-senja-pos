"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/money";

export type RevenuePoint = { day: string; revenue: number; orders: number };

export function RevenueBars({
  data,
  height = 220,
}: {
  data: RevenuePoint[];
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="2 4"
          />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(value: string) =>
              new Intl.DateTimeFormat("id-ID", {
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              }).format(new Date(`${value}T00:00:00Z`))
            }
            dy={6}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickFormatter={(value: number) => formatMoney(value, "IDR", { compact: true })}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as RevenuePoint;
              return (
                <div className="border border-border bg-popover px-3 py-2 text-xs shadow-sm">
                  <p className="mb-1 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                    {new Intl.DateTimeFormat("id-ID", {
                      dateStyle: "medium",
                      timeZone: "UTC",
                    }).format(new Date(`${label}T00:00:00Z`))}
                  </p>
                  <p className="font-mono text-sm">{formatMoney(point.revenue)}</p>
                  <p className="text-muted-foreground">{point.orders} pesanan</p>
                </div>
              );
            }}
          />
          <Bar
            dataKey="revenue"
            fill="var(--chart-1)"
            radius={[2, 2, 0, 0]}
            maxBarSize={36}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}