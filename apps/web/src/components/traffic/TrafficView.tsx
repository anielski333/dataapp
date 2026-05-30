import React, { useState, useEffect, useCallback } from "react";
import { FilterBar } from "../shared/FilterBar.js";
import { PanelTabs, SubTabs } from "../shared/PanelTabs.js";
import { KpiCard, KpiMini } from "../shared/KpiCard.js";
import { TableToolbar } from "../shared/TableToolbar.js";
import { formatMoney, formatNumber, formatChange, formatPercentValue } from "../../utils/format.js";
import { api } from "../../api/client.js";

type TrafficData = {
  kpis: Record<string, number | null>;
  changes: Record<string, number>;
  timeSeries: Array<{ date: string; sessions: number; users: number; pageviews: number; bounceRate: number; avgSessionDuration: number }>;
  products: Array<{ name: string; views: number; revenue: number; conversions: number; conversionRate: number }>;
  sources: Array<{ source: string; medium: string; sessions: number; users: number; revenue: number; conversionRate: number }>;
  events: Array<{ eventName: string; count: number; users: number; revenue: number }>;
  integrationStatus: string;
};

export function TrafficView() {
  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Przegląd");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<TrafficData>("/api/sales/traffic");
      setData(res);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="dashboard-column">
        <div className="page-head"><h1>Ruch</h1><FilterBar /></div>
        <div className="panel" style={{padding:40,textAlign:"center"}}>Ładowanie danych o ruchu...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-column">
      <div className="page-head">
        <h1>Ruch</h1>
        <FilterBar />
      </div>
      <PanelTabs tabs={["Przegląd", "Produkty", "Źródła i zdarzenia"]} active={tab} onChange={setTab} />
      {tab === "Przegląd" && <TrafficOverview data={data} />}
      {tab === "Produkty" && <TrafficProducts data={data} />}
      {tab === "Źródła i zdarzenia" && <TrafficSourcesEvents data={data} />}
    </div>
  );
}

function TrafficOverview({ data }: { data: TrafficData | null }) {
  const kpis = data?.kpis ?? {};
  const changes = data?.changes ?? {};
  const timeSeries = data?.timeSeries ?? [];

  return (
    <>
      <div className="kpi-grid">
        <KpiCard label="Sesje" value={kpis.sessions ?? null} change={changes.sessions} format="number" />
        <KpiCard label="Użytkownicy" value={kpis.users ?? null} change={changes.users} format="number" />
        <KpiCard label="Wyświetlenia" value={kpis.pageviews ?? null} change={changes.pageviews} format="number" />
        <KpiCard label="Wsp. odrzuceń" value={kpis.bounceRate ?? null} change={changes.bounceRate} format="percent" />
        <KpiCard label="Przychód" value={kpis.revenue ?? null} change={changes.revenue} format="money" />
        <KpiCard label="Konwersje" value={kpis.conversions ?? null} change={changes.conversions} format="number" />
      </div>
      {timeSeries.length > 0 && (
        <div className="panel">
          <h2>Sesje w czasie</h2>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Data</th><th>Sesje</th><th>Użytkownicy</th><th>Wyświetlenia</th><th>Wsp. odrzuceń</th><th>Śr. czas sesji</th></tr></thead>
              <tbody>
                {timeSeries.slice(-30).map((d, i) => (
                  <tr key={i}>
                    <td>{d.date}</td>
                    <td>{formatNumber(d.sessions)}</td>
                    <td>{formatNumber(d.users)}</td>
                    <td>{formatNumber(d.pageviews)}</td>
                    <td>{formatPercentValue(d.bounceRate)}</td>
                    <td>{d.avgSessionDuration ? `${Math.round(d.avgSessionDuration)}s` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {data?.integrationStatus && data.integrationStatus !== "CONNECTED" && (
        <div className="panel" style={{borderLeft:"4px solid #f59e0b"}}>
          <h2>Status integracji</h2>
          <p>GA4: {data.integrationStatus === "NEEDS_CONFIGURATION" ? "Wymaga konfiguracji" : data.integrationStatus === "ERROR" ? "Błąd połączenia" : "Nieznany"}</p>
          <p style={{color:"#64748b",marginTop:8}}>Skonfiguruj Google Analytics w zakładce Integracje.</p>
        </div>
      )}
    </>
  );
}

function TrafficProducts({ data }: { data: TrafficData | null }) {
  const products = data?.products ?? [];
  if (products.length === 0) {
    return <div className="panel" style={{padding:40,textAlign:"center"}}>Brak danych o produktach.</div>;
  }
  return (
    <div className="panel">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h2>Produkty</h2>
        <TableToolbar />
      </div>
      <div className="table-wrapper">
        <table className="data-table">
          <thead><tr><th>Produkt</th><th>Wyświetlenia</th><th>Przychód</th><th>Konwersje</th><th>Wsp. konwersji</th></tr></thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={i}>
                <td>{p.name}</td>
                <td>{formatNumber(p.views)}</td>
                <td>{formatMoney(p.revenue)}</td>
                <td>{formatNumber(p.conversions)}</td>
                <td>{formatPercentValue(p.conversionRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrafficSourcesEvents({ data }: { data: TrafficData | null }) {
  const sources = data?.sources ?? [];
  const events = data?.events ?? [];
  return (
    <>
      <div className="panel">
        <h2>Źródła ruchu</h2>
        {sources.length === 0 ? (
          <p style={{padding:20,textAlign:"center",color:"#64748b"}}>Brak danych o źródłach.</p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Źródło</th><th>Medium</th><th>Sesje</th><th>Użytkownicy</th><th>Przychód</th><th>Wsp. konwersji</th></tr></thead>
              <tbody>
                {sources.map((s, i) => (
                  <tr key={i}>
                    <td>{s.source}</td><td>{s.medium}</td>
                    <td>{formatNumber(s.sessions)}</td><td>{formatNumber(s.users)}</td>
                    <td>{formatMoney(s.revenue)}</td>
                    <td>{formatPercentValue(s.conversionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="panel">
        <h2>Zdarzenia</h2>
        {events.length === 0 ? (
          <p style={{padding:20,textAlign:"center",color:"#64748b"}}>Brak danych o zdarzeniach.</p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Zdarzenie</th><th>Liczba</th><th>Użytkownicy</th><th>Przychód</th></tr></thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i}>
                    <td>{e.eventName}</td><td>{formatNumber(e.count)}</td><td>{formatNumber(e.users)}</td><td>{formatMoney(e.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
