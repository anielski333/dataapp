import React, { useState } from "react";
import { Hash, SlidersHorizontal, Database, Tag, Package, ShoppingCart, DollarSign, CreditCard, Box, Truck } from "lucide-react";
import { FilterBar } from "../shared/FilterBar.js";
import { PanelTabs } from "../shared/PanelTabs.js";
import { SubTabs } from "../shared/PanelTabs.js";
import { KpiMini } from "../shared/KpiCard.js";
import { formatMoney, formatNumber, formatChange } from "../../utils/format.js";

export function OrdersView() {
  const [tab, setTab] = useState("Przegląd");
  return (
    <div className="dashboard-column">
      <div className="page-head">
        <h1>Zamówienia</h1>
        <FilterBar />
      </div>
      <PanelTabs tabs={["Przegląd", "Zamówienia", "Rabaty", "Płatności", "Dostawa"]} active={tab} onChange={setTab} />
      {tab === "Przegląd" && <OrdersOverview />}
      {tab === "Zamówienia" && <DailyOrdersView />}
      {tab === "Rabaty" && <DiscountOrdersTab />}
      {tab === "Płatności" && <PaymentMethodsSection />}
      {tab === "Dostawa" && <DeliveryMethodsSection />}
    </div>
  );
}

function OrdersOverview() {
  return (
    <div className="orders-overview-grid">
      <div className="order-card panel">
        <h2>Kluczowe metryki</h2>
        <OrderKeyMetrics />
      </div>
      <div className="order-card panel">
        <h2>Rozkład wartości zamówienia</h2>
        <OrderValueDistribution />
      </div>
      <div className="order-card panel">
        <StatusHead title="Status zamówień" />
        <OrderStatusAnalysis />
      </div>
    </div>
  );
}

function OrderKeyMetrics() {
  const items = [
    { label: "Średnia wartość zamówienia", value: 185.4, change: 3.2 },
    { label: "Średni koszt dostawy", value: 14.9, change: -1.8 },
    { label: "Średni rabat", value: 32.5, change: 5.1 },
    { label: "Współczynnik zwrotów", value: 8.3, change: -0.5 },
  ];
  return (
    <div className="order-metric-list">
      {items.map((item) => (
        <div key={item.label} className="order-metric active">
          <DollarSign size={18} />
          <div>
            <span>{item.label}</span>
            <strong>{formatMoney(item.value)}</strong>
          </div>
          <em className={item.change >= 0 ? "up" : "down"}>{formatChange(item.change)}</em>
        </div>
      ))}
    </div>
  );
}

function OrderValueDistribution() {
  const ranges = [
    { range: "0-50 PLN", orders: 124, revenue: 3840, pct: 12 },
    { range: "51-100 PLN", orders: 287, revenue: 21540, pct: 28 },
    { range: "101-200 PLN", orders: 342, revenue: 51300, pct: 34 },
    { range: "201-500 PLN", orders: 198, revenue: 69300, pct: 18 },
    { range: "500+ PLN", orders: 82, revenue: 61500, pct: 8 },
  ];
  return (
    <div className="value-distribution">
      {ranges.map((r) => (
        <article key={r.range} className="active">
          <strong>{r.range}</strong>
          <p>{formatNumber(r.orders)} zamówień</p>
          <p>{formatMoney(r.revenue)}</p>
        </article>
      ))}
    </div>
  );
}

function StatusHead({ title }: { title: string }) {
  return (
    <div className="status-head">
      <h2>{title}</h2>
      <button>Szczegóły</button>
    </div>
  );
}

function OrderStatusAnalysis() {
  const statuses = [
    { name: "Zrealizowane", count: 687, value: 156300, color: "#10b981" },
    { name: "W realizacji", count: 124, value: 28200, color: "#3b82f6" },
    { name: "Oczekujące", count: 89, value: 16700, color: "#f59e0b" },
    { name: "Zwrócone", count: 56, value: 12400, color: "#ef4444" },
  ];
  const total = statuses.reduce((s, st) => s + st.count, 0);
  return (
    <div className="status-scroll">
      {statuses.map((st) => (
        <div key={st.name} className="status-block">
          <div className="status-title">
            <h3>{st.name}</h3>
            <strong>{formatNumber(st.count)}</strong>
          </div>
          <div style={{ height: 6, background: "#eef2f8", borderRadius: 3 }}>
            <div style={{ width: `${(st.count / total) * 100}%`, height: "100%", background: st.color, borderRadius: 3 }} />
          </div>
          <small style={{ display: "block", marginTop: 6, color: "#64748b" }}>Wartość: {formatMoney(st.value)}</small>
        </div>
      ))}
    </div>
  );
}

function DailyOrdersView() {
  const days = [
    { date: "22 maj", orders: 111, revenue: 11840, aov: 106.7, koszty: 6950, margin: 41.3, delivery: 14.2, rabat: 22.8 },
    { date: "23 maj", orders: 129, revenue: 13220, aov: 102.5, koszty: 7850, margin: 40.6, delivery: 13.8, rabat: 24.1 },
    { date: "24 maj", orders: 117, revenue: 12110, aov: 103.5, koszty: 7200, margin: 40.5, delivery: 14.5, rabat: 23.5 },
    { date: "25 maj", orders: 157, revenue: 16040, aov: 102.2, koszty: 9420, margin: 41.3, delivery: 13.9, rabat: 25.2 },
    { date: "26 maj", orders: 132, revenue: 13590, aov: 103.0, koszty: 8050, margin: 40.8, delivery: 14.1, rabat: 23.9 },
    { date: "27 maj", orders: 146, revenue: 14930, aov: 102.3, koszty: 8670, margin: 41.9, delivery: 13.7, rabat: 24.8 },
    { date: "28 maj", orders: 132, revenue: 14550, aov: 110.2, koszty: 7664, margin: 47.3, delivery: 14.3, rabat: 10.6 },
  ];
  return (
    <div className="daily-orders-card panel">
      <div className="daily-head">
        <h2>Zamówienia dzienne</h2>
        <div className="daily-actions">
          <button className="active">Dziennie</button>
          <button>Tygodniowo</button>
          <button>Miesięcznie</button>
        </div>
      </div>
      <div style={{ overflow: "auto" }}>
        <table className="daily-table">
          <thead>
            <tr>
              <th>Data</th><th>Zamówienia</th><th>Przychód</th><th>AOV</th><th>Koszty</th><th>Marża</th><th>Dostawa</th><th>Rabat</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td>{d.date}</td><td>{formatNumber(d.orders)}</td><td>{formatMoney(d.revenue)}</td>
                <td>{formatMoney(d.aov)}</td><td>{formatMoney(d.koszty)}</td>
                <td>{d.margin}%</td><td>{formatMoney(d.delivery)}</td><td>{formatMoney(d.rabat)}</td>
              </tr>
            ))}
            <tr className="daily-total">
              <td>Suma</td><td>{formatNumber(days.reduce((s, d) => s + d.orders, 0))}</td>
              <td>{formatMoney(days.reduce((s, d) => s + d.revenue, 0))}</td>
              <td>{formatMoney(days.reduce((s, d) => s + d.revenue, 0) / days.reduce((s, d) => s + d.orders, 0))}</td>
              <td>{formatMoney(days.reduce((s, d) => s + d.koszty, 0))}</td>
              <td>{(days.reduce((s, d) => s + d.margin, 0) / days.length).toFixed(1)}%</td>
              <td>{formatMoney(days.reduce((s, d) => s + d.delivery, 0))}</td>
              <td>{formatMoney(days.reduce((s, d) => s + d.rabat, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiscountOrdersTab() {
  return (
    <div className="discount-analysis panel">
      <h2>Analiza rabatów</h2>
      <div className="discount-share">
        <strong>54% zamówień z rabatem</strong>
        <strong>46% zamówień bez rabatu</strong>
        <span>356 z 659 zamówień w okresie zawiera co najmniej jeden rabat</span>
      </div>
      <div className="discount-compare">
        <div className="discount-group">
          <div className="discount-group-head yellow">
            <span><Tag size={20} /></span>
            <div><h3>Z rabatem</h3><p>Niższa wartość koszyka</p></div>
          </div>
          <div className="discount-metric"><span>Średnia wartość</span><strong>{formatMoney(94.5)}</strong><em>-12.3%</em></div>
          <div className="discount-metric"><span>Średni rabat</span><strong>{formatMoney(32.5)}</strong><em>+5.1%</em></div>
        </div>
        <div className="discount-group">
          <div className="discount-group-head blue">
            <span><ShoppingCart size={20} /></span>
            <div><h3>Bez rabatu</h3><p>Wyższa wartość koszyka</p></div>
          </div>
          <div className="discount-metric">
                <h3>{formatMoney(94.5)}</h3>
                <p>Wyższa wartość koszyka</p>
              </div>
            </div>
            <div className="discount-col">
              <h3>Bez rabatu</h3>
              <p>46% zamówień (303)</p>
              <div className="discount-metric">
                <h3>{formatMoney(156.2)}</h3>
                <p>Średnia wartość koszyka</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
