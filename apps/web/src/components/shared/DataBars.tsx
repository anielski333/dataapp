import React from "react";

const MAX_BARS = 42;

const barColors = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6", "#84cc16",
];

export function DataBars({ data, maxValue, height = 130 }: { data: number[]; maxValue?: number; height?: number }) {
  const sliced = data.slice(-MAX_BARS);
  const mx = maxValue ?? Math.max(...sliced, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height, padding: "0 16px 16px" }}>
      {sliced.map((v, i) => {
        const pct = Math.max((v / mx) * 100, 2);
        return <div key={i} style={{ width: "100%", height: `${pct}%`, background: barColors[i % barColors.length], borderRadius: "2px 2px 0 0", minWidth: 3 }} />;
      })}
    </div>
  );
}
