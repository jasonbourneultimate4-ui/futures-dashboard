"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import type { PriceBar } from "@/lib/types";

interface Props {
  data: PriceBar[];
  title: string;
}

export default function PriceChart({ data, title }: Props) {
  const chartData = data.map((bar) => ({
    time: format(new Date(bar.timestamp), "HH:mm"),
    date: format(new Date(bar.timestamp), "MMM dd"),
    close: bar.close,
    volume: bar.volume,
    high: bar.high,
    low: bar.low,
    open: bar.open,
  }));

  return (
    <div className="panel">
      <h3 className="panel-title">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--grid)" }}
            />
            <YAxis
              yAxisId="price"
              orientation="right"
              domain={["auto", "auto"]}
              tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => v.toLocaleString()}
            />
            <YAxis
              yAxisId="vol"
              orientation="left"
              domain={[0, "auto"]}
              tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`
              }
              hide
            />
            <Tooltip
              contentStyle={{
                background: "var(--panel-bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--text-secondary)" }}
            />
            <Bar
              yAxisId="vol"
              dataKey="volume"
              fill="var(--volume-bar)"
              opacity={0.3}
              barSize={3}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="close"
              stroke="var(--price-line)"
              dot={false}
              strokeWidth={1.5}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
