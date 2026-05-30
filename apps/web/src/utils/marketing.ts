import type { MarketingData } from "../types/index.js";

export function csvDelimiter(csv: string): string {
  const first = csv.split("\n")[0] || "";
  const commas = (first.match(/,/g) || []).length;
  const semis = (first.match(/;/g) || []).length;
  const tabs = (first.match(/\t/g) || []).length;
  if (tabs > commas && tabs > semis) return "\t";
  return semis > commas ? ";" : ",";
}

export function firstCsvValue(csv: string): string {
  const delim = csvDelimiter(csv);
  const line = csv.split("\n")[1] || csv.split("\n")[0] || "";
  return line.split(delim)[0]?.trim() || "";
}

export function firstCsvProvider(csv: string): string {
  const v = firstCsvValue(csv).toLowerCase();
  if (v.includes("google")) return "google";
  if (v.includes("meta") || v.includes("facebook")) return "meta";
  if (v.includes("tiktok")) return "tiktok";
  return "";
}

export function firstCsvChannel(csv: string): string {
  const v = firstCsvValue(csv).toLowerCase();
  if (v.includes("uk")) return "uk";
  return "pl";
}

export function formatImportPreview(preview: any): string {
  const parts: string[] = [];
  if (preview.rows) parts.push(`${preview.rows} wierszy`);
  if (preview.periods) parts.push(`okres: ${preview.periods}`);
  if (preview.summary?.spend) parts.push(`wydatki: ${preview.summary.spend.toFixed(2)}`);
  if (preview.summary?.revenue) parts.push(`przychód: ${preview.summary.revenue.toFixed(2)}`);
  if (preview.replacementImpact) parts.push(`zastąpione: ${preview.replacementImpact.campaignsReplaced} kampanii`);
  return parts.join(" | ");
}

export function providerTotals(data: MarketingData | null): Array<{ provider: string; spend: number; revenue: number; roas: number }> {
  if (!data?.providerSummary) return [];
  return data.providerSummary.map((p: any) => ({
    provider: p.provider || "unknown",
    spend: p.spend || 0,
    revenue: p.revenue || 0,
    roas: p.spend > 0 ? (p.revenue || 0) / p.spend : 0,
  }));
}

export function campaignRows(data: MarketingData | null): Array<{ provider: string; name: string; spend: number; revenue: number; roas: number; ctr: number; cpc: number; impressions: number; clicks: number; conversions: number }> {
  if (!data?.campaignDaily) return [];
  const map = new Map<string, any>();
  for (const row of data.campaignDaily as any[]) {
    const key = `${row.provider}:${row.campaignName}`;
    if (!map.has(key)) map.set(key, { provider: row.provider, name: row.campaignName, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 });
    const item = map.get(key);
    item.spend += row.spend || 0;
    item.revenue += row.revenue || 0;
    item.impressions += row.impressions || 0;
    item.clicks += row.clicks || 0;
    item.conversions += row.conversions || 0;
  }
  return Array.from(map.values()).map((item) => ({
    ...item,
    roas: item.spend > 0 ? item.revenue / item.spend : 0,
    ctr: item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0,
    cpc: item.clicks > 0 ? item.spend / item.clicks : 0,
  }));
}

const ctxToPrefix: Record<string, string> = {
  marketing: "marketing", traffic: "traffic", summary: "sales",
  orders: "orders", products: "products", customers: "customers",
  integrations: "integrations", settings: "settings",
};

export function getAiContextPrefix(view: string): string {
  return ctxToPrefix[view] || "sales";
}
