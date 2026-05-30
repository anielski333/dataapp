import React from "react";
import { SlidersHorizontal, Calendar } from "lucide-react";

export function FilterBar() {
  return (
    <div className="filterbar">
      <button><SlidersHorizontal size={14} /> Wszystkie kanały</button>
      <button><Calendar size={14} /> 22 maj — 28 maj 2026</button>
      <button><Calendar size={14} /> vs 15 maj — 21 maj 2026</button>
      <button className="data-button" title="Importuj dane">+</button>
    </div>
  );
}
