import React from "react";
import { formatChange } from "../../utils/format.js";

export function PercentBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  const cls = value >= 0 ? "up" : "down";
  return <em className={cls}>{formatChange(value)}</em>;
}
