import React, { useState, useEffect, useCallback } from "react";
import { FilterBar } from "../shared/FilterBar.js";
import { PanelTabs, SubTabs } from "../shared/PanelTabs.js";
import { KpiCard, KpiMini } from "../shared/KpiCard.js";
import { formatMoney, formatNumber, formatChange, formatPercentValue, formatDateTime, formatDate } from "../../utils/format.js";
import { api } from "../../api/client.js";
import { csvDelimiter, firstCsvValue, firstCsvProvider, firstCsvChannel, warningSuffix, formatImportPreview } from "../../utils/marketing.js";

type MarketingData = {
  totals: { spend: number; revenue: number; impressions: number; clicks: number; conversions: number };
  providers: { google: any; meta: any; tiktok: any };
  daily: Array<{ date: string; googleCost: number; metaCost: number; tiktokCost: number; revenue: number; orders: number }>;
  campaigns: any[];
  quality: any;
  nextImportActions: any[];
  scope: any;
  reconciliation: any;
  diagnostics: any;
  blockers: string[];
};

type MarketingCampaign = { id: string; name: string; provider: string; status: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number };

export function MarketingView() {
  const [data, setData] = useState<MarketingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Przegląd");
  const [subTab, setSubTab] = useState("Przegląd");
  const [syncing, setSyncing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<MarketingData>("/api/sales/marketing");
      setData(res);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const doSync = async (provider: string, endpoint: string) => {
    setSyncing(provider);
    setMessage(null);
    try {
      const res = await api.post<{ message: string }>(endpoint);
      setMessage(`Sync ${provider}: ${res.message}`);
      await load();
    } catch (e: any) {
      setMessage(`Błąd sync ${provider}: ${e.message}`);
    }
    setSyncing(null);
  };

  if (loading && !data) {
    return <div className="dashboard-column"><div className="page-head"><h1>Marketing</h1><FilterBar /></div><div className="panel" style={{padding:40,textAlign:"center"}}>Ładowanie danych marketingowych...</div></div>;
  }

  const totals = data?.totals ?? { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
  const daily = data?.daily ?? [];
  const campaigns = data?.campaigns ?? [];

  return (
    <div className="dashboard-column">
      <div className="page-head">
        <h1>Marketing</h1>
        <FilterBar />
      </div>
      <PanelTabs tabs={["Przegląd", "Kampanie", "Google Ads", "Meta Ads", "TikTok Ads", "Import"]} active={tab} onChange={setTab} />
      {tab === "Przegląd" && <MarketingOverview data={data} totals={totals} daily={daily} />}
      {tab === "Kampanie" && <MarketingCampaigns campaigns={campaigns} />}
      {tab === "Google Ads" && <MarketingProvider provider="google" syncing={syncing} onSync={() => doSync("google", "/api/sales/marketing/sync/google-ads")} />}
      {tab === "Meta Ads" && <MarketingProvider provider="meta" syncing={syncing} onSync={() => doSync("meta", "/api/sales/marketing/sync/meta-ads")} />}
      {tab === "TikTok Ads" && <MarketingProvider provider="tiktok" syncing={syncing} onSync={() => doSync("tiktok", "/api/sales/marketing/sync/tiktok-ads")} />}
      {tab === "Import" && <MarketingImport onImport={load} />}
      {message && <div className="panel" style={{padding:16,marginTop:16,background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8}}>{message}</div>}
    </div>
  );
}

function MarketingOverview({ data, totals, daily }: { data: MarketingData | null; totals: any; daily: Array<any> }) {
  const roas = totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(2) : "-";
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const cpa = totals.conversions > 0 ? totals.spend / totals.conversions : 0;
  return (
    <>
      <div className="kpi-grid">
        <KpiCard label="Wydatki" value={totals.spend} format="money" />
        <KpiCard label="Przychód" value={totals.revenue} format="money" accent="green" />
        <KpiCard label="ROAS" value={roas !== "-" ? parseFloat(roas) : null} format="number" />
        <KpiCard label="Impresje" value={totals.impressions} format="number" />
        <KpiCard label="Kliknięcia" value={totals.clicks} format="number" />
        <KpiCard label="CPC" value={cpc} format="money" />
        <KpiCard label="Konwersje" value={totals.conversions} format="number" />
        <KpiCard label="CPA" value={cpa} format="money" />
      </div>
      {daily.length > 0 && (
        <div className="panel">
          <h2>Koszty w czasie</h2>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Data</th><th>Google</th><th>Meta</th><th>TikTok</th><th>Przychód</th><th>Zamówienia</th></tr></thead>
              <tbody>
                {daily.map((d, i) => (
                  <tr key={i}><td>{d.date}</td><td>{formatMoney(d.googleCost)}</td><td>{formatMoney(d.metaCost)}</td><td>{formatMoney(d.tiktokCost)}</td><td>{formatMoney(d.revenue)}</td><td>{formatNumber(d.orders)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {data?.quality && <MarketingDataQuality quality={data.quality} />}
      {data?.blockers && data.blockers.length > 0 && (
        <div className="panel" style={{borderLeft:"4px solid #f59e0b"}}>
          <h2>Blokery integracji</h2>
          <ul>{data.blockers.map((b,i) => <li key={i}>{b}</li>)}</ul>
        </div>
      )}
    </>
  );
}

function MarketingDataQuality({ quality }: { quality: any }) {
  if (!quality) return null;
  return (
    <div className="panel">
      <h2>Jakość danych</h2>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {Object.entries(quality).map(([k,v]) => (
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0"}}>
            <span>{k}</span><span>{(v as any)?.toString() ?? "-"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketingCampaigns({ campaigns }: { campaigns: MarketingCampaign[] }) {
  if (!campaigns || campaigns.length === 0) {
    return <div className="panel" style={{padding:40,textAlign:"center"}}>Brak kampanii. Zaimportuj dane marketingowe.</div>;
  }
  return (
    <div className="panel">
      <h2>Kampanie ({campaigns.length})</h2>
      <div className="table-wrapper">
        <table className="data-table">
          <thead><tr><th>Nazwa</th><th>Źródło</th><th>Status</th><th>Wydatki</th><th>Impresje</th><th>Kliknięcia</th><th>Konwersje</th><th>Przychód</th><th>ROAS</th></tr></thead>
          <tbody>
            {campaigns.map((c) => {
              const roas = c.spend > 0 ? (c.revenue / c.spend).toFixed(2) : "-";
              return (
                <tr key={c.id}>
                  <td>{c.name}</td><td>{c.provider}</td><td>{c.status}</td>
                  <td>{formatMoney(c.spend)}</td><td>{formatNumber(c.impressions)}</td><td>{formatNumber(c.clicks)}</td><td>{formatNumber(c.conversions)}</td>
                  <td>{formatMoney(c.revenue)}</td><td>{roas}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MarketingProvider({ provider, syncing, onSync }: { provider: string; syncing: string | null; onSync: () => void }) {
  const label = provider === "google" ? "Google Ads" : provider === "meta" ? "Meta Ads" : "TikTok Ads";
  const isSyncing = syncing === provider;
  return (
    <div className="panel">
      <h2>{label}</h2>
      <p style={{color:"#64748b",marginBottom:16}}>Synchronizuj dane reklamowe z {label}.</p>
      <button className="btn-primary" onClick={onSync} disabled={isSyncing}>
        {isSyncing ? "Synchronizowanie..." : `Synchronizuj ${label}`}
      </button>
      <div style={{marginTop:16}}>
        <h3>Dostępne metryki</h3>
        <ul style={{paddingLeft:20,color:"#64748b",lineHeight:1.8}}>
          <li>Koszty kampanii</li>
          <li>Impresje i kliknięcia</li>
          <li>Konwersje i przychód</li>
          <li>CTR, CPC, CPA</li>
        </ul>
      </div>
    </div>
  );
}
