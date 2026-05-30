import React from "react";
import { formatNumber, formatPercentValue } from "../../utils/format.js";

type FunnelStep = { step: string; value: number; rate: number; change: number };

export function Funnel({ data }: { data: FunnelStep[] }) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="summary-funnel panel">
      <h2>Lejek sprzedażowy</h2>
      {data.map((item) => {
        const pct = (item.value / maxVal) * 100;
        return (
          <div key={item.step} className="funnel-row" style={{ display: "grid", gridTemplateColumns: "100px 1fr auto", gap: "10px", alignItems: "center", marginBottom: "10px" }}>
            <span>{item.step}</span>
            <div style={{ height: 28, background: "#eef2f8", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "#3b82f6", borderRadius: 4 }} />
            </div>
            <div style={{ textAlign: "right" }}>
              <strong>{formatNumber(item.value)}</strong>
              <small style={{ display: "block", color: "#64748b" }}>{formatPercentValue(item.rate)}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}
