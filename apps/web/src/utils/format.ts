export function formatMoney(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("pl-PL").format(value);
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null) return "-";
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return value.toString();
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${value.toFixed(1)}%`;
}

export function formatChange(value: number | null | undefined): string {
  if (value == null) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatPercentValue(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    return new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    return new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "short",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export function formatRange(start: string, end: string): string {
  const fmt = (s: string) => new Date(s).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
  try {
    return `${fmt(start)} — ${fmt(end)}`;
  } catch {
    return `${start} — ${end}`;
  }
}

export function formatAdsSyncMessage(msg: string): string {
  if (!msg) return "";
  return msg.replace(/\[?(\d{4}-\d{2}-\d{2})/g, (_, d) => new Date(d).toLocaleDateString("pl-PL"));
}

export function formatAnalyticsSyncMessage(msg: string): string {
  if (!msg) return "";
  return msg.replace(/\d{4}-\d{2}-\d{2}/g, (d) => new Date(d).toLocaleDateString("pl-PL"));
}
