import React from "react";
import { Download, Upload, Filter } from "lucide-react";

export function TableToolbar() {
  return (
    <div className="table-toolbar">
      <button><Download size={14} /> Eksport</button>
      <button><Upload size={14} /> Import</button>
      <button><Filter size={14} /></button>
    </div>
  );
}

export function DataCell({ value, format }: { value: number; format?: "money" | "number" }) {
  const fmt = format === "money"
    ? new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", minimumFractionDigits: 2 }).format(value)
    : new Intl.NumberFormat("pl-PL").format(value);
  return <td>{fmt}</td>;
}
