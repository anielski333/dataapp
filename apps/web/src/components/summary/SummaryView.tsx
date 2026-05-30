import React, { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FilterBar } from "../shared/FilterBar.js";
import { KpiCard } from "../shared/KpiCard.js";
import { Funnel } from "../shared/Funnel.js";
import { PanelTabs } from "../shared/PanelTabs.js";
import { Skeleton } from "../shared/Skeleton.js";
import { formatMoney, formatNumber, formatChange } from "../../utils/format.js";
import { api } from "../../api/client.js";
import type { SummaryResponse, Product, Campaign } from "../../types/index.js";

export function SummaryView() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("Przegląd");

  useEffect(() => {
    api.get<SummaryResponse>("/api/sales/summary")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="dashboard-column"><Skeleton /></div>;
  if (error) return <div className="dashboard-column"><div className="panel" style={{ color: "red", padding: 20 }}>Błąd: {error}</div></div>;

  return (
    <div className="dashboard-column">
      <div className="page-head">
        <h1>Podsumowanie</h1>
        <FilterBar />
      </div>
      <PanelTabs tabs={["Przegląd", "Analiza", "Kanały"]} active={tab} onChange={setTab} />
      {tab === "Przegląd" && <OverviewPanel data={data!} />}
      {tab === "Analiza" && <AnalysisPanel data={data!} />}
      {tab === "Kanały" && <ChannelPanel data={data!} />}
    </div>
  );
}

function OverviewPanel({ data }: { data: SummaryResponse }) {
  const kpis = data.kpis;
  const changes = data.changes;
  return (
    <div className="grid-layout">
      <section className="summary-analysis panel" style={{ gridColumn: "span 8" }}>
        <h2>Przychody i koszty</h2>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data.timeSeries}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0757e6" stopOpacity={0.15} /><stop offset="100%" stopColor="#0757e6" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f8" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => new Date(v).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
            <Tooltip formatter={(v: number) => formatMoney(v)} />
            <Area type="monotone" dataKey="revenueNet" stroke="#0757e6" fill="url(#revGrad)" strokeWidth={2} name="Przychód" />
            <Area type="monotone" dataKey="totalCost" stroke="#ef4444" fill="none" strokeWidth={2} strokeDasharray="4 3" name="Koszty" />
          </AreaChart>
        </ResponsiveContainer>
      </section>
      <section className="summary-key panel" style={{ gridColumn: "span 4" }}>
        <h2>Kluczowe wskaźniki</h2>
        <KpiCard label="Przychód netto" value={kpis.revenueNet} change={changes.revenueNet} accent="green" />
        <KpiCard label="Koszt całkowity" value={kpis.totalCost} change={changes.totalCost} accent="red" />
        <KpiCard label="Marża" value={kpis.margin} change={changes.margin} accent="blue" format="percent" />
        <KpiCard label="Zamówienia" value={kpis.orders} change={changes.orders} format="number" />
        <KpiCard label="Średnia wartość zamówienia" value={kpis.aov} change={changes.aov} />
        <KpiCard label="ROAS" value={kpis.roas} change={changes.roas} format="number" />
      </section>
    </div>
  );
}

function AnalysisPanel({ data }: { data: SummaryResponse }) {
  return (
    <>
      <div className="grid-layout" style={{ marginBottom: 20 }}>
        <div className="summary-ad panel" style={{ gridColumn: "span 7" }}>
          <h2>Wydajność reklam</h2>
          <AdPerformance campaigns={data.adSources} />
        </div>
        <div className="summary-segments panel" style={{ gridColumn: "span 5" }}>
          <h2>Segmenty klientów</h2>
          <CustomerSegmentsPanel segments={data.customerSegments} />
        </div>
      </div>
      <div className="grid-layout">
        <Funnel data={data.funnel} />
        <div className="summary-products panel" style={{ gridColumn: "span 8" }}>
          <h2>Top produkty</h2>
          <TopProductsList products={data.topProducts} />
        </div>
      </div>
    </>
  );
}

function ChannelPanel({ data }: { data: SummaryResponse }) {
  return (
    <div className="summary-channel panel">
      <h2>Analiza kanałów</h2>
      <ChannelAnalysis kpis={data.kpis} />
    </div>
  );
}

function AdPerformance({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {campaigns.map((c) => (
        <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "center", padding: "10px 12px", border: "1px solid #e8edf5", borderRadius: 7 }}>
          <strong>{c.name}</strong>
          <span>Wydatki: {formatMoney(c.spend)}</span>
          <span>Przychód: {formatMoney(c.revenue)}</span>
          <span style={{ fontWeight: 900, color: c.spend > 0 && c.revenue / c.spend > 1 ? "#10b981" : "#ef4444" }}>ROAS: {(c.revenue / (c.spend || 1)).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function CustomerSegmentsPanel({ segments }: { segments: SummaryResponse["customerSegments"] }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {[
        { label: "Nowi klienci", data: segments.new, color: "#3b82f6" },
        { label: "Powracający", data: segments.returning, color: "#8b5cf6" },
      ].map((seg) => (
        <div key={seg.label} style={{ padding: "12px", border: "1px solid #e8edf5", borderRadius: 7 }}>
          <span style={{ fontWeight: 800, color: seg.color }}>{seg.label}</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div><small>Klienci</small><strong>{formatNumber(seg.data.customers)}</strong></div>
            <div><small>Przychód</small><strong>{formatMoney(seg.data.revenue)}</strong></div>
            <div><small>AOV</small><strong>{formatMoney(seg.data.aov)}</strong></div>
            <div><small>Zmiana</small><strong>{formatChange(seg.data.change)}</strong></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TopProductsList({ products }: { products: Product[] }) {
  return (
    <div>
      {products.slice(0, 6).map((p) => (
        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eef2f8" }}>
          <span>{p.name}</span>
          <span>{formatMoney(p.revenueNet)}</span>
          <span style={{ color: p.changePct >= 0 ? "#10b981" : "#ef4444" }}>{formatChange(p.changePct)}</span>
        </div>
      ))}
    </div>
  );
}

function ChannelAnalysis({ kpis }: { kpis: Record<string, number | null> }) {
  const metrics = [
    { label: "Przychód PL", key: "revenuePl" },
    { label: "Przychód UK", key: "revenueUk" },
    { label: "Zamówienia PL", key: "ordersPl" },
    { label: "Zamówienia UK", key: "ordersUk" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      {metrics.map((m) => (
        <div key={m.key} style={{ padding: 12, background: "#fbfcff", borderRadius: 7, border: "1px solid #e8edf5" }}>
          <span style={{ color: "#64748b", fontSize: 12, fontWeight: 900 }}>{m.label}</span>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{kpis[m.key] != null ? formatMoney(kpis[m.key]) : "-"}</div>
        </div>
      ))}
    </div>
  );
}
