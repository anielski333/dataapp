import React, { useState } from "react";
import { FilterBar } from "../shared/FilterBar.js";
import { PanelTabs } from "../shared/PanelTabs.js";
import { SubTabs } from "../shared/PanelTabs.js";
import { TableToolbar } from "../shared/TableToolbar.js";
import { formatMoney, formatNumber, formatChange } from "../../utils/format.js";

export function ProductsView() {
  const [tab, setTab] = useState("Przegląd");
  return (
    <div className="dashboard-column">
      <div className="page-head">
        <h1>Produkty</h1>
        <FilterBar />
      </div>
      <PanelTabs tabs={["Przegląd", "Produkty", "Ceny", "Słowa kluczowe"]} active={tab} onChange={setTab} />
      {tab === "Przegląd" && <ProductsOverview />}
      {tab === "Produkty" && <ProductsTabContent />}
      {tab === "Ceny" && <ProductPricesView />}
      {tab === "Słowa kluczowe" && <ProductWordsTable />}
    </div>
  );
}

const products = [
  { name: "Kapsułki wygładzające BEGONIA Róża 30ml", sku: "853917", revenue: 6921.71, units: 155, margin: 41, change: -13.4 },
  { name: "Kapsułki nawilżające ANEMONE Kokos 500ml", sku: "973920", revenue: 2467.50, units: 125, margin: 35, change: -18.47 },
  { name: "Pianka wygładzająca COSMOS Papaja 400ml", sku: "836319", revenue: 2382.80, units: 145, margin: 52, change: 54.55 },
  { name: "Tonik wygładzający SERENE Bambus 500ml", sku: "963944", revenue: 2276.75, units: 175, margin: 48, change: 88.81 },
  { name: "Spray rozświetlający VIOLETZ Eukaliptus 30ml", sku: "209094", revenue: 2141.63, units: 37, margin: 44, change: -4.55 },
  { name: "Szampon przeciwzmarszczkowy VIBRANT Jagoda Acai 150ml", sku: "1042863", revenue: 1923.32, units: 181, margin: 29, change: -43.61 },
];

function ProductsOverview() {
  return (
    <div className="grid-layout">
      <div className="panel" style={{ gridColumn: "span 4" }}>
        <h2>Segmenty marży</h2>
        <ProductMarginSegments />
      </div>
      <div className="panel" style={{ gridColumn: "span 4" }}>
        <h2>Dostępność</h2>
        <ProductAvailability />
      </div>
      <div className="panel" style={{ gridColumn: "span 4" }}>
        <h2>Ostatnio dodane</h2>
        <ProductListCard />
      </div>
    </div>
  );
}

function ProductMarginSegments() {
  const segments = [
    { label: "Wysoka marża (>50%)", count: 12, value: "38%" },
    { label: "Średnia marża (30-50%)", count: 24, value: "46%" },
    { label: "Niska marża (<30%)", count: 8, value: "16%" },
  ];
  return (
    <div>
      {segments.map((s) => (
        <div key={s.label} style={{ padding: "12px 0", borderBottom: "1px solid #eef2f8" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{s.label}</span>
            <strong>{s.count} produktów</strong>
            <span>{s.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductAvailability() {
  return (
    <div>
      {[
        { label: "Dostępne", count: 38, color: "#10b981" },
        { label: "Niskiego stanu", count: 4, color: "#f59e0b" },
        { label: "Wyprzedane", count: 2, color: "#ef4444" },
      ].map((item) => (
        <div key={item.label} style={{ padding: "12px 0", borderBottom: "1px solid #eef2f8", display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: item.color }}>{item.label}</span>
          <strong>{item.count}</strong>
        </div>
      ))}
    </div>
  );
}

function ProductListCard() {
  return (
    <div>
      {products.slice(0, 4).map((p) => (
        <div key={p.sku} style={{ padding: "8px 0", borderBottom: "1px solid #eef2f8", fontSize: 13 }}>
          <div>{p.name}</div>
          <small style={{ color: "#64748b" }}>{formatMoney(p.revenue)}</small>
        </div>
      ))}
    </div>
  );
}

function ProductsTabContent() {
  return (
    <div className="order-table-card panel">
      <div className="order-table-head">
        <h2>Lista produktów</h2>
        <TableToolbar />
      </div>
      <div style={{ overflow: "auto" }}>
        <table className="order-data-table">
          <thead>
            <tr><th>#</th><th>Nazwa produktu</th><th>SKU</th><th>Przychód</th><th>Sztuki</th><th>Marża</th><th>Cena</th><th>Zmiana</th></tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={p.sku}>
                <td>{i + 1}</td><td>{p.name}</td><td>{p.sku}</td>
                <td>{formatMoney(p.revenue)}</td><td>{formatNumber(p.units)}</td>
                <td>{p.margin}%</td><td>{formatMoney(p.revenue / p.units)}</td>
                <td><em className={p.change >= 0 ? "up" : "down"}>{formatChange(p.change)}</em></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductPricesView() {
  return (
    <div className="order-table-card panel">
      <div className="order-table-head">
        <h2>Historia cen</h2>
        <TableToolbar />
      </div>
      <div style={{ overflow: "auto" }}>
        <table className="order-data-table">
          <thead><tr><th>Produkt</th><th>Aktualna cena</th><th>Poprzednia cena</th><th>Zmiana</th><th>Data zmiany</th></tr></thead>
          <tbody>
            {products.slice(0, 6).map((p) => (
              <tr key={p.sku}>
                <td>{p.name}</td><td>{formatMoney(p.revenue / p.units)}</td>
                <td>{formatMoney((p.revenue / p.units) * 1.05)}</td>
                <td><em className={p.change >= 0 ? "down" : "up"}>{(p.change * -0.1).toFixed(1)}%</em></td>
                <td>15 maj 2026</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductWordsTable() {
  const words = [
    { word: "kapsułki", count: 12, revenue: 12340, conversion: 4.8 },
    { word: "nawilżający", count: 8, revenue: 8920, conversion: 3.9 },
    { word: "wygładzający", count: 7, revenue: 7650, conversion: 5.2 },
    { word: "pianka", count: 5, revenue: 5430, conversion: 6.1 },
    { word: "tonik", count: 4, revenue: 4120, conversion: 7.4 },
  ];
  return (
    <div className="order-table-card panel">
      <div className="order-table-head"><h2>Słowa kluczowe w nazwach produktów</h2></div>
      <div style={{ overflow: "auto" }}>
        <table className="order-data-table">
          <thead><tr><th>Słowo</th><th>Produkty</th><th>Przychód</th><th>Konwersja</th></tr></thead>
          <tbody>
            {words.map((w) => (
              <tr key={w.word}><td>{w.word}</td><td>{w.count}</td><td>{formatMoney(w.revenue)}</td><td>{w.conversion}%</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
