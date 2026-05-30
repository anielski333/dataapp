import React from "react";
import { formatMoney, formatNumber, formatChange } from "../../utils/format.js";

type Props = {
  label: string;
  value: number | null;
  change?: number | null;
  accent?: "green" | "red" | "blue";
  format?: "money" | "number" | "percent";
};

export function KpiCard({ label, value, change, accent, format: fmt = "money" }: Props) {
  const fmtValue = fmt === "number" ? formatNumber(value) : fmt === "percent" ? (value != null ? `${value.toFixed(1)}%` : "-") : formatMoney(value);
  return (
    <article className={`panel ${accent ? `kpi-${accent}` : ""}`}>
      <span>{label}</span>
      <strong>{fmtValue}</strong>
      {change != null && <em className={change >= 0 ? "up" : "down"}>{formatChange(change)}</em>}
    </article>
  );
}

export function KpiMini({ label, value, change }: { label: string; value: number | null; change?: number | null }) {
  return (
    <div className="order-metric">
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
      {change != null && <em className={change >= 0 ? "up" : "down"}>{formatChange(change)}</em>}
    </div>
  );
}

export function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <article className="marketing-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </article>
  );
}
