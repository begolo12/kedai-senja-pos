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

export type HourlyPoint = { hour: number; revenue: number; orders: number };

const HOUR_LABEL = new Intl.DateTimeFormat("id-ID", {
  hour: "numeric",
  timeZone: "Asia/Jakarta",
});

export function HourlyBars({
  data,
  height = 200,
}: {
  data: HourlyPoint[];
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
          <XAxis
            dataKey="hour"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            interval={1}
            tickFormatter={(value: number) => HOUR_LABEL.format(new Date(2026, 0, 1, value))}
            dy={6}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={58}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickFormatter={(value: number) => formatMoney(value, "IDR", { compact: true })}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as HourlyPoint;
              return (
                <div className="border border-border bg-popover px-3 py-2 text-xs shadow-sm">
                  <p className="mb-1 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                    {HOUR_LABEL.format(new Date(2026, 0, 1, point.hour))} WIB
                  </p>
                  <p className="font-mono text-sm">{formatMoney(point.revenue)}</p>
                  <p className="text-muted-foreground">{point.orders} pesanan</p>
                </div>
              );
            }}
          />
          <Bar dataKey="revenue" fill="var(--chart-3)" radius={[2, 2, 0, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
