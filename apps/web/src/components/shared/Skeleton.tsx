import React from "react";

export function Skeleton() {
  return (
    <div style={{ padding: 40, display: "grid", gap: 20 }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ height: 32, background: "#eef2f8", borderRadius: 7, animation: "shimmer 1.5s ease-in-out infinite" }} />
      ))}
    </div>
  );
}
