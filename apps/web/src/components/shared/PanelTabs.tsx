import React from "react";

type Props = {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
};

export function PanelTabs({ tabs, active, onChange }: Props) {
  return (
    <div className="panel-tabs">
      <div>
        {tabs.map((t) => (
          <button key={t} className={active === t ? "active" : ""} onClick={() => onChange(t)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SubTabs({ tabs, active, onChange }: Props) {
  return (
    <div className="subtabs">
      {tabs.map((t) => (
        <button key={t} className={active === t ? "active" : ""} onClick={() => onChange(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}
