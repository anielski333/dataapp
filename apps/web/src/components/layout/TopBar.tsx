import React from "react";
import { HelpCircle, UserRoundCog, MessageSquare, LogOut } from "lucide-react";

export function TopBar({ onToggleAi }: { onToggleAi: () => void }) {
  return (
    <header className="topbar">
      <div className="topbar-actions">
        <div className="company-pill">Anielski Hub</div>
        <button className="icon-button"><HelpCircle size={18} /></button>
        <button className="icon-button" onClick={onToggleAi}><MessageSquare size={18} /></button>
        <button className="icon-button"><UserRoundCog size={18} /></button>
        <button className="icon-button"><LogOut size={18} /></button>
      </div>
    </header>
  );
}
