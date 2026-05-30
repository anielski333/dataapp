import React from "react";
import { BarChart3, ShoppingCart, Package, Users, Megaphone, Gauge, Link2, Settings } from "lucide-react";
import type { View } from "../../types/index.js";

type NavItem = { view: View; icon: React.ReactNode; label: string };

const navItems: NavItem[] = [
  { view: "summary", icon: <BarChart3 size={18} />, label: "Podsumowanie" },
  { view: "orders", icon: <ShoppingCart size={18} />, label: "Zamówienia" },
  { view: "products", icon: <Package size={18} />, label: "Produkty" },
  { view: "customers", icon: <Users size={18} />, label: "Klienci" },
  { view: "marketing", icon: <Megaphone size={18} />, label: "Marketing" },
  { view: "traffic", icon: <Gauge size={18} />, label: "Ruch" },
  { view: "integrations", icon: <Link2 size={18} />, label: "Integracje" },
  { view: "settings", icon: <Settings size={18} />, label: "Ustawienia" },
];

export function Sidebar({ activeView, onNavigate }: { activeView: View; onNavigate: (view: View) => void }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" />
        <div>
          <strong>DataOrganizer</strong>
          <span>Sales Dashboard</span>
        </div>
      </div>
      <nav>
        {navItems.map((item) => (
          <button
            key={item.view}
            className={`nav-item ${activeView === item.view ? "active" : ""}`}
            onClick={() => onNavigate(item.view)}
            title={item.label}
          >
            {item.icon}
          </button>
        ))}
      </nav>
    </aside>
  );
}
