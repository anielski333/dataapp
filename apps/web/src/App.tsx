import React, { useState, useCallback, useEffect } from "react";
import type { View } from "./types/index.js";
import { AppShell } from "./components/layout/AppShell.js";
import { SummaryView } from "./components/summary/SummaryView.js";
import { OrdersView } from "./components/orders/OrdersView.js";
import { ProductsView } from "./components/products/ProductsView.js";
import { CustomersView } from "./components/customers/CustomersView.js";
import { MarketingView } from "./components/marketing/MarketingView.js";
import { TrafficView } from "./components/traffic/TrafficView.js";
import { IntegrationsView } from "./components/integrations/IntegrationsView.js";
import { SettingsView } from "./components/settings/SettingsView.js";
import { AiPanel } from "./components/ai/AiPanel.js";

export default function App() {
  const [activeView, setActiveView] = useState<View>("summary");
  const [aiOpen, setAiOpen] = useState(false);

  const viewFromUrl = useCallback(() => {
    const hash = window.location.hash.replace("#", "") as View;
    const validViews: View[] = ["summary","orders","products","customers","marketing","traffic","integrations","settings"];
    if (validViews.includes(hash)) {
      setActiveView(hash);
    }
  }, []);

  useEffect(() => {
    viewFromUrl();
    window.addEventListener("hashchange", viewFromUrl);
    return () => window.removeEventListener("hashchange", viewFromUrl);
  }, [viewFromUrl]);

  const handleNavigate = useCallback((view: View) => {
    setActiveView(view);
    window.location.hash = view;
  }, []);

  const renderView = () => {
    switch (activeView) {
      case "summary": return <SummaryView />;
      case "orders": return <OrdersView />;
      case "products": return <ProductsView />;
      case "customers": return <CustomersView />;
      case "marketing": return <MarketingView />;
      case "traffic": return <TrafficView />;
      case "integrations": return <IntegrationsView />;
      case "settings": return <SettingsView />;
      default: return <SummaryView />;
    }
  };

  return (
    <AppShell activeView={activeView} onNavigate={handleNavigate} onToggleAi={() => setAiOpen((prev) => !prev)}>
      {renderView()}
      <AiPanel />
    </AppShell>
  );
}
