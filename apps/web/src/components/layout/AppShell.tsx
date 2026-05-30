import React from "react";
import type { View } from "../../types/index.js";
import { Sidebar } from "./Sidebar.js";
import { TopBar } from "./TopBar.js";

interface AppShellProps {
  activeView: View;
  onNavigate: (view: View) => void;
  onToggleAi: () => void;
  sidebarCollapsed?: boolean;
  children: React.ReactNode;
}

export function AppShell({ activeView, onNavigate, onToggleAi, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} onNavigate={onNavigate} />
      <div className="main-area">
        <TopBar onToggleAi={onToggleAi} />
        {children}
      </div>
    </div>
  );
}
