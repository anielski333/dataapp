import React, { useState, useEffect, useCallback } from "react";
import { Settings, Plug, RefreshCw, CheckCircle, XCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { FilterBar } from "../shared/FilterBar.js";
import { PanelTabs } from "../shared/PanelTabs.js";
import { formatDateTime, formatDate } from "../../utils/format.js";
import { api } from "../../api/client.js";

type IntegrationItem = {
  id: string;
  provider: string;
  name: string;
  status: "CONNECTED" | "ERROR" | "DISCONNECTED" | "PENDING";
  lastSync?: string;
  metrics?: { orders?: number; revenue?: number };
  config?: Record<string, string>;
};

type IntegrationOverview = {
  total: number;
  connected: number;
  channels: Array<{ id: string; name: string; accounts: IntegrationItem[] }>;
};

export function IntegrationsView() {
  const [data, setData] = useState<IntegrationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Przegląd");
  const [configModal, setConfigModal] = useState<IntegrationItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<IntegrationOverview>("/api/sales/integrations");
      setData(res);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="dashboard-column">
        <div className="page-head"><h1>Integracje</h1><FilterBar /></div>
        <div className="panel" style={{padding:40,textAlign:"center"}}>Ładowanie integracji...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-column">
      <div className="page-head">
        <h1>Integracje</h1>
        <FilterBar />
      </div>
      <PanelTabs tabs={["Przegląd", "API", "Logi"]} active={tab} onChange={setTab} />
      {tab === "Przegląd" && (
        <>
          <div className="kpi-grid">
            <div className="panel" style={{textAlign:"center"}}>
              <span style={{fontSize:28,fontWeight:700}}>{data?.total ?? 0}</span>
              <span style={{display:"block",color:"#64748b",fontSize:13}}>Wszystkie integracje</span>
            </div>
            <div className="panel" style={{textAlign:"center"}}>
              <span style={{fontSize:28,fontWeight:700,color:"#10b981"}}>{data?.connected ?? 0}</span>
              <span style={{display:"block",color:"#64748b",fontSize:13}}>Aktywne</span>
            </div>
            <div className="panel" style={{textAlign:"center"}}>
              <span style={{fontSize:28,fontWeight:700,color:"#64748b"}}>{(data?.total ?? 0) - (data?.connected ?? 0)}</span>
              <span style={{display:"block",color:"#64748b",fontSize:13}}>Nieaktywne</span>
            </div>
          </div>
          {data?.channels.map((channel) => (
            <div className="panel" key={channel.id}>
              <h2>{channel.name}</h2>
              <div style={{display:"grid",gap:12}}>
                {channel.accounts.map((acc) => (
                  <IntegrationCard key={acc.id} item={acc} onConfigure={() => setConfigModal(acc)} onRefresh={load} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
      {tab === "API" && <IntegrationApiView />}
      {tab === "Logi" && <IntegrationLogs />}
      {configModal && (
        <IntegrationConfigModal
          item={configModal}
          onClose={() => setConfigModal(null)}
          onSaved={() => { setConfigModal(null); load(); }}
        />
      )}
    </div>
  );
}

function IntegrationCard({ item, onConfigure, onRefresh }: { item: IntegrationItem; onConfigure: () => void; onRefresh: () => void }) {
  const statusIcon = {
    CONNECTED: <CheckCircle size={16} style={{color:"#10b981"}} />,
    ERROR: <XCircle size={16} style={{color:"#ef4444"}} />,
    DISCONNECTED: <AlertTriangle size={16} style={{color:"#f59e0b"}} />,
    PENDING: <RefreshCw size={16} style={{color:"#3b82f6"}} />,
  }[item.status];

  const statusLabel = {
    CONNECTED: "Połączono",
    ERROR: "Błąd",
    DISCONNECTED: "Rozłączono",
    PENDING: "Oczekuje",
  }[item.status];

  const doTest = async () => {
    try {
      const res = await api.post<{ message: string }>(`/api/sales/integrations/${item.id}/test`);
      alert(res.message);
    } catch (e: any) {
      alert(`Błąd: ${e.message}`);
    }
  };

  const doSync = async () => {
    try {
      const res = await api.post<{ message: string }>(`/api/sales/integrations/${item.id}/sync`);
      alert(res.message);
      onRefresh();
    } catch (e: any) {
      alert(`Błąd: ${e.message}`);
    }
  };

  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        {statusIcon}
        <div>
          <strong>{item.name}</strong>
          <div style={{fontSize:12,color:"#64748b"}}>{item.provider} — {statusLabel}</div>
          {item.lastSync && <div style={{fontSize:11,color:"#94a3b8"}}>Ostatnia synchronizacja: {formatDateTime(item.lastSync)}</div>}
        </div>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn-secondary" onClick={doTest} style={{fontSize:12}}>Test</button>
        <button className="btn-secondary" onClick={doSync} style={{fontSize:12}}>Sync</button>
        <button className="btn-primary" onClick={onConfigure} style={{fontSize:12}}>Konfiguruj</button>
      </div>
    </div>
  );
}

function IntegrationApiView() {
  return (
    <div className="panel">
      <h2>API REST</h2>
      <p style={{color:"#64748b",marginBottom:16}}>Endpointy API dla integracji zewnętrznych.</p>
      <div style={{display:"grid",gap:8}}>
        <ApiEndpoint method="GET" path="/api/sales/integrations" desc="Lista wszystkich integracji" />
        <ApiEndpoint method="POST" path="/api/sales/integrations/:id/sync" desc="Wymuszenie synchronizacji" />
        <ApiEndpoint method="POST" path="/api/sales/integrations/:id/test" desc="Test połączenia" />
        <ApiEndpoint method="POST" path="/api/sales/integrations/:id/configure" desc="Aktualizacja konfiguracji" />
        <ApiEndpoint method="DELETE" path="/api/sales/integrations/:id" desc="Usunięcie integracji" />
      </div>
    </div>
  );
}

function ApiEndpoint({ method, path, desc }: { method: string; path: string; desc: string }) {
  const colors: Record<string, string> = { GET: "#3b82f6", POST: "#10b981", PUT: "#f59e0b", DELETE: "#ef4444" };
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"8px 12px",background:"#f8fafc",borderRadius:6,fontFamily:"monospace",fontSize:13}}>
      <span style={{color:colors[method] || "#64748b",fontWeight:600,minWidth:50}}>{method}</span>
      <span style={{color:"#1e293b"}}>{path}</span>
      <span style={{color:"#94a3b8",marginLeft:"auto",fontFamily:"sans-serif"}}>{desc}</span>
    </div>
  );
}

function IntegrationLogs() {
  const [logs, setLogs] = useState<Array<{ time: string; level: string; message: string; source: string }>>([]);
  
  useEffect(() => {
    api.get<Array<{ time: string; level: string; message: string; source: string }>>("/api/sales/integrations/logs")
      .then(setLogs)
      .catch(() => {});
  }, []);

  return (
    <div className="panel">
      <h2>Logi integracji</h2>
      {logs.length === 0 ? (
        <p style={{color:"#64748b",padding:20,textAlign:"center"}}>Brak logów.</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>Czas</th><th>Poziom</th><th>Źródło</th><th>Wiadomość</th></tr></thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={i}>
                  <td>{formatDateTime(l.time)}</td>
                  <td><span style={{color:l.level === "ERROR" ? "#ef4444" : l.level === "WARN" ? "#f59e0b" : "#64748b"}}>{l.level}</span></td>
                  <td>{l.source}</td>
                  <td>{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
