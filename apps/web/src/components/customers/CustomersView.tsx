import React, { useState } from "react";
import { Users, TrendingUp, Repeat, ShoppingBag } from "lucide-react";
import { FilterBar } from "../shared/FilterBar.js";
import { PanelTabs } from "../shared/PanelTabs.js";
import { formatMoney, formatNumber, formatChange } from "../../utils/format.js";

export function CustomersView() {
  const [tab, setTab] = useState("Przegląd");
  return (
    <div className="dashboard-column">
      <div className="page-head">
        <h1>Klienci</h1>
        <FilterBar />
      </div>
      <PanelTabs tabs={["Przegląd", "Segmenty", "Częstotliwość", "LTV", "Produkty"]} active={tab} onChange={setTab} />
      {tab === "Przegląd" && <CustomersOverview />}
      {tab === "Segmenty" && <CustomerSegmentsView />}
      {tab === "Częstotliwość" && <CustomerFrequencyView />}
      {tab === "LTV" && <CustomerLtvRetentionView />}
      {tab === "Produkty" && <CustomerProductsView />}
    </div>
  );
}

function CustomersOverview() {
  return (
    <div className="grid-layout">
      <div className="panel" style={{ gridColumn: "span 4" }}>
        <h2>Nowi klienci</h2>
        <div style={{ fontSize: 32, fontWeight: 700, color: "#3b82f6" }}>{formatNumber(284)}</div>
        <div style={{ marginTop: 8, color: "#10b981" }}>+12.4% vs poprzedni okres</div>
        <div style={{ marginTop: 16 }}>
          <div style={{ padding: "8px 0", borderBottom: "1px solid #eef2f8" }}>
            <span>Przychód: {formatMoney(42150)}</span>
          </div>
          <div style={{ padding: "8px 0" }}>
            <span>AOV: {formatMoney(148.4)}</span>
          </div>
        </div>
      </div>
      <div className="panel" style={{ gridColumn: "span 4" }}>
        <h2>Powracający klienci</h2>
        <div style={{ fontSize: 32, fontWeight: 700, color: "#8b5cf6" }}>{formatNumber(687)}</div>
        <div style={{ marginTop: 8, color: "#10b981" }}>+5.8% vs poprzedni okres</div>
        <div style={{ marginTop: 16 }}>
          <div style={{ padding: "8px 0", borderBottom: "1px solid #eef2f8" }}>
            <span>Przychód: {formatMoney(148200)}</span>
          </div>
          <div style={{ padding: "8px 0" }}>
            <span>AOV: {formatMoney(215.7)}</span>
          </div>
        </div>
      </div>
      <div className="panel" style={{ gridColumn: "span 4" }}>
        <h2>Wskaźniki retencji</h2>
        <div style={{ padding: "12px 0", borderBottom: "1px solid #eef2f8" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Retencja 7 dni</span><strong>42%</strong>
          </div>
        </div>
        <div style={{ padding: "12px 0", borderBottom: "1px solid #eef2f8" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Retencja 30 dni</span><strong>28%</strong>
          </div>
        </div>
        <div style={{ padding: "12px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Retencja 90 dni</span><strong>15%</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerSegmentsView() {
  const segments = [
    { name: "Nowi klienci", count: 284, revenue: 42150, pct: 22, color: "#3b82f6" },
    { name: "Powracający", count: 687, revenue: 148200, pct: 53, color: "#8b5cf6" },
    { name: "VIP", count: 124, revenue: 89200, pct: 10, color: "#f59e0b" },
    { name: "Nieaktywni (90d)", count: 198, revenue: 0, pct: 15, color: "#64748b" },
  ];
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  return (
    <div className="grid-layout">
      {segments.map((seg) => (
        <div key={seg.name} className="panel" style={{ gridColumn: "span 3" }}>
          <span style={{ color: seg.color, fontWeight: 800 }}>{seg.name}</span>
          <div style={{ fontSize: 28, fontWeight: 700, margin: "8px 0" }}>{formatNumber(seg.count)}</div>
          <div style={{ height: 6, background: "#eef2f8", borderRadius: 3 }}>
            <div style={{ width: `${(seg.count / total) * 100}%`, height: "100%", background: seg.color, borderRadius: 3 }} />
          </div>
          <div style={{ marginTop: 8, color: "#64748b" }}>
            <div>Przychód: {formatMoney(seg.revenue)}</div>
            <div>Udział: {seg.pct}%</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CustomerFrequencyView() {
  const frequencies = [
    { label: "Częste zakupy (1-7 dni)", count: 156, revenue: 45200, pct: 18 },
    { label: "Regularne (8-30 dni)", count: 423, revenue: 89600, pct: 48 },
    { label: "Okazjonalne (31-90 dni)", count: 198, revenue: 32400, pct: 22 },
    { label: "Rzadkie (90+ dni)", count: 112, revenue: 12400, pct: 12 },
  ];
  return (
    <div className="panel">
      <h2>Częstotliwość zakupów</h2>
      <div style={{ display: "grid", gap: 16 }}>
        {frequencies.map((f) => (
          <div key={f.label} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, alignItems: "center", padding: "12px", border: "1px solid #e8edf5", borderRadius: 7 }}>
            <span style={{ fontWeight: 700 }}>{f.label}</span>
            <span>{formatNumber(f.count)} klientów</span>
            <span style={{ color: "#64748b", fontSize: 13 }}>{f.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomerLtvRetentionView() {
  const ltvData = [
    { range: "0-100 PLN", customers: 312, pct: 24 },
    { range: "101-500 PLN", customers: 456, pct: 35 },
    { range: "501-2000 PLN", customers: 298, pct: 23 },
    { range: "2000+ PLN", customers: 234, pct: 18 },
  ];
  return (
    <div className="grid-layout">
      <div className="panel" style={{ gridColumn: "span 6" }}>
        <h2>Rozkład LTV</h2>
        {ltvData.map((d) => (
          <div key={d.range} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eef2f8" }}>
            <span>{d.range}</span>
            <strong>{formatNumber(d.customers)}</strong>
            <span style={{ color: "#64748b" }}>{d.pct}%</span>
          </div>
        ))}
      </div>
      <div className="panel" style={{ gridColumn: "span 6" }}>
        <h2>Retencja klientów</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {[
            { period: "Po 1 zakupie", rate: 100 },
            { period: "Po 2 zakupach", rate: 62 },
            { period: "Po 3 zakupach", rate: 41 },
            { period: "Po 4 zakupach", rate: 28 },
            { period: "Po 5+ zakupach", rate: 19 },
          ].map((r) => (
            <div key={r.period} style={{ display: "grid", gridTemplateColumns: "1fr 60px", gap: 12, alignItems: "center" }}>
              <span>{r.period}</span>
              <div style={{ height: 24, background: "#eef2f8", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                <div style={{ width: `${r.rate}%`, height: "100%", background: r.rate > 50 ? "#3b82f6" : r.rate > 30 ? "#8b5cf6" : "#f59e0b", borderRadius: 4 }} />
                <span style={{ position: "absolute", right: 4, top: 2, fontSize: 11, fontWeight: 700 }}>{r.rate}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CustomerProductsView() {
  const products = [
    { name: "Kapsułki BEGONIA Róża 30ml", newCust: 42, returningCust: 113, total: 155 },
    { name: "Kapsułki ANEMONE Kokos 500ml", newCust: 38, returningCust: 87, total: 125 },
    { name: "Pianka COSMOS Papaja 400ml", newCust: 51, returningCust: 94, total: 145 },
    { name: "Tonik SERENE Bambus 500ml", newCust: 62, returningCust: 113, total: 175 },
    { name: "Spray VIOLETZ Eukaliptus 30ml", newCust: 12, returningCust: 25, total: 37 },
  ];
  return (
    <div className="order-table-card panel">
      <div className="order-table-head"><h2>Produkty według segmentów klientów</h2></div>
      <div style={{ overflow: "auto" }}>
        <table className="order-data-table">
          <thead><tr><th>Produkt</th><th>Nowi klienci</th><th>Powracający</th><th>Razem<
          <thead><tr><th>Produkt</th><th>Nowi klienci</th><th>Powracający</th><th>Razem</th></tr></thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={i}>
                <td>{p.name}</td>
                <td>{formatNumber(p.newCustomers)}</td>
                <td>{formatNumber(p.returningCustomers)}</td>
                <td>{formatNumber(p.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
