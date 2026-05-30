import { GoogleGenerativeAI } from "@google/generative-ai";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { buildTrafficResponse } from "./traffic.js";

export const salesRouter = Router();

const querySchema = z.object({
  from: z.string().optional().default("2026-05-22"),
  to: z.string().optional().default("2026-05-28"),
  compareFrom: z.string().optional().default("2026-05-15"),
  compareTo: z.string().optional().default("2026-05-21"),
  channels: z.string().optional().default("pl,uk"),
});

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseChannels(value: string) {
  return value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function enumerateDateKeys(from: string, to: string) {
  const result: string[] = [];
  const cursor = toDate(from);
  const end = toDate(to);
  while (cursor <= end) {
    result.push(dateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function pct(current: number, previous: number) {
  if (!previous) return 0;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function money(value: number) {
  return Number(value.toFixed(2));
}

function diffPercent(source: number, target: number) {
  if (!source && !target) return 0;
  const basis = Math.max(Math.abs(source), Math.abs(target), 1);
  return money(((target - source) / basis) * 100);
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function parseCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, ""));
}

function detectDelimiter(line: string) {
  const semicolons = (line.match(/;/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  const tabs = (line.match(/\t/g) ?? []).length;
  if (tabs >= semicolons && tabs >= commas) return "\t";
  return semicolons > commas ? ";" : ",";
}

function parseNumberValue(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const cleaned = raw
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/,(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCostValue(value: unknown, header?: string) {
  const parsed = parseNumberValue(value);
  return header && normalizeHeader(header).includes("micros") ? parsed / 1_000_000 : parsed;
}

function findColumn(headers: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeHeader);
  return headers.findIndex((header) => normalizedCandidates.includes(header));
}

function stableCampaignId(provider: string, name: string) {
  const hash = createHash("sha1").update(`${provider}:${name}`).digest("hex").slice(0, 12);
  return `import-${normalizeHeader(provider) || "ads"}-${hash}`;
}

function stableCampaignDailyId(campaignId: string, channelId: string, date: Date, source = "CSV/import") {
  const day = date.toISOString().slice(0, 10);
  const hash = createHash("sha1").update(`${campaignId}:${channelId}:${day}:${source}`).digest("hex").slice(0, 16);
  return `campaign-day-${hash}`;
}

function normalizeChannelId(value: unknown, fallback: string) {
  const normalized = normalizeHeader(String(value ?? ""));
  if (!normalized) return fallback;
  if (["pl", "polska", "poland", "pol", "mobradpl"].includes(normalized) || normalized.includes("polska") || normalized.includes("poland")) {
    return "pl";
  }
  if (["uk", "gb", "greatbritain", "unitedkingdom", "mobraduk"].includes(normalized) || normalized.includes("unitedkingdom") || normalized.includes("greatbritain")) {
    return "uk";
  }
  return fallback;
}

function campaignMatchKey(provider: string, name: string) {
  return `${normalizeHeader(provider)}:${normalizeHeader(name)}`;
}

function humanizeIntegrationMessage(message: string) {
  if (message.includes("Invalid leading whitespace") && message.includes("header value")) {
    const value = message.match(/header value: '([^']+)'/)?.[1]?.trim();
    return value
      ? `Google Ads odrzuca identyfikator klienta z początkową spacją: ${value}. Trzeba poprawić customer ID w połączeniu.`
      : "Google Ads odrzuca customer ID z nieprawidłowym formatem. Trzeba poprawić identyfikator klienta w połączeniu.";
  }
  if (message.includes("Proxy execute is not enabled") || message.includes("Proxy Execute jest wyłączone")) {
    return "Composio Proxy Execute jest wyłączone dla tej organizacji, więc połączenie OAuth nie pozwala jeszcze pobrać metryk.";
  }
  if (message.includes("demo-property")) {
    return "GA4 ma wpisane demo-property zamiast prawdziwego Property ID.";
  }
  if (message.length > 220) {
    return `${message.slice(0, 217)}...`;
  }
  return message;
}

function parseCampaignCsv(csv: string, defaultProvider: string) {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = parseCsvLine(lines[0], delimiter);
  const headers = rawHeaders.map(normalizeHeader);
  const column = {
    date: findColumn(headers, ["date", "data", "day", "dzien", "segmentsdate", "reportingstarts", "reportingstart", "reportingends", "reportingend", "reportdate", "statdate", "stat_time_day", "stattimeday", "byday"]),
    channelId: findColumn(headers, ["channel", "channelid", "saleschannel", "market", "country", "countryterritory", "account", "accountid", "accountname", "accountcurrency", "rynek", "kraj"]),
    provider: findColumn(headers, ["provider", "source", "platform", "adplatform", "network", "adnetworktype", "publisherplatform", "placement", "zrodlo", "kanal"]),
    name: findColumn(headers, ["campaign", "campaignname", "campaignidname", "campaignnamereporting", "campaignname", "campaign_name", "campaignid", "kampania", "nazwakampanii"]),
    spend: findColumn(headers, ["cost", "costs", "costmicros", "metricscostmicros", "spend", "amountspent", "amountspentpln", "amountspentusd", "amountspenteur", "totalcost", "totalcostpln", "costpln", "costusd", "costeur", "adspend", "wydatki", "kwotawydana", "koszt", "koszty", "kosztreklamowy"]),
    revenue: findColumn(headers, ["conversionvalue", "metricsconversionsvalue", "conversionsvalue", "metricsallconversionsvalue", "convvalue", "allconvvalue", "allconversionsvalue", "purchaseconversionvalue", "purchasesconversionvalue", "websitepurchasesconversionvalue", "totalpurchasevalue", "purchasevalue", "revenue", "grossrevenue", "totalrevenue", "sales", "wartosczakupow", "wartosckonwersji", "przychod", "przychodreklam"]),
    impressions: findColumn(headers, ["impressions", "metricsimpressions", "impr", "wyswietlenia", "displayed", "impression"]),
    clicks: findColumn(headers, ["clicks", "metricsclicks", "klikniecia", "linkclicks", "outboundclicks", "allclicks", "destinationclicks", "landingpageviews", "inline_link_clicks", "inlinelinkclicks", "click"]),
    conversions: findColumn(headers, ["conversions", "metricsconversions", "metricsallconversions", "allconversions", "purchases", "websitepurchases", "onsitepurchases", "completepayment", "completepayments", "completepaymentroas", "conversion", "totalcompletepayment", "totalcompletepayments", "results", "result", "zakupy", "konwersje", "purchase"]),
  };
  if (column.name < 0) {
    throw new Error(`CSV nie ma rozpoznanej kolumny kampanii. Obsługiwane m.in.: Campaign, Campaign name, Kampania, Nazwa kampanii.`);
  }
  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line, delimiter);
    const name = row[column.name]?.trim() || "Kampania bez nazwy";
    const provider = column.provider >= 0 ? row[column.provider]?.trim() || defaultProvider : defaultProvider;
    return {
      id: stableCampaignId(provider, name),
      provider,
      name,
      date: column.date >= 0 ? parseCsvDate(row[column.date]) : null,
      channelId: column.channelId >= 0 ? normalizeChannelId(row[column.channelId], "pl") : "pl",
      spend: money(parseCostValue(row[column.spend], rawHeaders[column.spend])),
      revenue: money(parseNumberValue(row[column.revenue])),
      impressions: Math.round(parseNumberValue(row[column.impressions])),
      clicks: Math.round(parseNumberValue(row[column.clicks])),
      conversions: Math.round(parseNumberValue(row[column.conversions])),
    };
  }).filter((row) => row.name && (row.spend || row.revenue || row.impressions || row.clicks || row.conversions));
}

function aggregateCampaignRows(rows: ReturnType<typeof parseCampaignCsv>) {
  return Array.from(rows.reduce((map, row) => {
    const current = map.get(row.id) ?? {
      id: row.id,
      provider: row.provider,
      name: row.name,
      spend: 0,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    };
    current.spend += row.spend;
    current.revenue += row.revenue;
    current.impressions += row.impressions;
    current.clicks += row.clicks;
    current.conversions += row.conversions;
    map.set(row.id, current);
    return map;
  }, new Map<string, { id: string; provider: string; name: string; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>()).values())
    .map((row) => ({
      ...row,
      spend: money(row.spend),
      revenue: money(row.revenue),
      impressions: Math.round(row.impressions),
      clicks: Math.round(row.clicks),
      conversions: Math.round(row.conversions),
    }));
}

function aggregateCampaignRowsByDay(rows: ReturnType<typeof parseCampaignCsv>, defaultChannelId: string) {
  return Array.from(rows.filter((row) => row.date).reduce((map, row) => {
    const channelId = row.channelId || defaultChannelId;
    const key = `${channelId}|${row.date!.toISOString()}`;
    const current = map.get(key) ?? {
      channelId,
      date: row.date!,
      mediaCost: 0,
      revenueNet: 0,
      impressions: 0,
      clicks: 0,
      adConversions: 0,
    };
    current.mediaCost += row.spend;
    current.revenueNet += row.revenue;
    current.impressions += row.impressions;
    current.clicks += row.clicks;
    current.adConversions += row.conversions;
    map.set(key, current);
    return map;
  }, new Map<string, { channelId: string; date: Date; mediaCost: number; revenueNet: number; impressions: number; clicks: number; adConversions: number }>()).values())
    .map((row) => ({
      ...row,
      mediaCost: money(row.mediaCost),
      revenueNet: money(row.revenueNet),
      impressions: Math.round(row.impressions),
      clicks: Math.round(row.clicks),
      adConversions: Math.round(row.adConversions),
    }));
}

function aggregateCampaignRowsByCampaignDay(rows: ReturnType<typeof parseCampaignCsv>, defaultChannelId: string) {
  return Array.from(rows.filter((row) => row.date).reduce((map, row) => {
    const channelId = row.channelId || defaultChannelId;
    const key = `${row.id}|${channelId}|${row.date!.toISOString()}`;
    const current = map.get(key) ?? {
      id: stableCampaignDailyId(row.id, channelId, row.date!),
      campaignId: row.id,
      provider: row.provider,
      campaignName: row.name,
      channelId,
      date: row.date!,
      spend: 0,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      source: "CSV/import",
    };
    current.spend += row.spend;
    current.revenue += row.revenue;
    current.impressions += row.impressions;
    current.clicks += row.clicks;
    current.conversions += row.conversions;
    map.set(key, current);
    return map;
  }, new Map<string, { id: string; campaignId: string; provider: string; campaignName: string; channelId: string; date: Date; spend: number; revenue: number; impressions: number; clicks: number; conversions: number; source: string }>()).values())
    .map((row) => ({
      ...row,
      spend: money(row.spend),
      revenue: money(row.revenue),
      impressions: Math.round(row.impressions),
      clicks: Math.round(row.clicks),
      conversions: Math.round(row.conversions),
    }));
}

function parseCsvDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (/^\d{8}$/.test(raw)) {
    return new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00.000Z`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00.000Z`);
  }
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
    const [dayPart, monthPart, yearPart] = raw.split(".");
    return new Date(`${yearPart}-${monthPart}-${dayPart}T00:00:00.000Z`);
  }
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(raw)) {
    return new Date(`${raw.replace(/\//g, "-")}T00:00:00.000Z`);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [firstPart, secondPart, yearPart] = raw.split("/");
    const first = Number(firstPart);
    const second = Number(secondPart);
    const dayPart = first > 12 ? firstPart : secondPart;
    const monthPart = first > 12 ? secondPart : firstPart;
    return new Date(`${yearPart}-${monthPart}-${dayPart}T00:00:00.000Z`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Nie rozpoznano daty w CSV: ${raw}`);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function parseTrafficCsv(csv: string, defaultChannelId: string, defaultPropertyId: string) {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = parseCsvLine(lines[0], delimiter);
  const headers = rawHeaders.map(normalizeHeader);
  const column = {
    date: findColumn(headers, ["date", "data", "day", "dzien", "datehour", "week"]),
    channelId: findColumn(headers, ["channel", "channelid", "saleschannel", "market", "country", "countryterritory", "account", "accountname", "kanal", "rynek", "kraj"]),
    propertyId: findColumn(headers, ["propertyid", "property", "ga4propertyid", "ga4property"]),
    source: findColumn(headers, ["source", "sessionsource", "firstusersource", "manualsource", "utmsource", "utm_source", "zrodlo", "sourceplatform"]),
    medium: findColumn(headers, ["medium", "sessionmedium", "firstusermedium", "manualmedium", "utmmedium", "utm_medium", "nosnik"]),
    campaign: findColumn(headers, ["campaign", "sessioncampaign", "sessioncampaignname", "firstusercampaign", "manualcampaignname", "utmcampaign", "utm_campaign", "kampania"]),
    sessions: findColumn(headers, ["sessions", "sesje"]),
    views: findColumn(headers, ["views", "screenpageviews", "pageviews", "wyswietlenia", "odslony"]),
    transactions: findColumn(headers, ["transactions", "ecommercetransactions", "purchase", "purchases", "keyeventspurchase", "transakcje", "zakupy"]),
    revenue: findColumn(headers, ["purchaserevenue", "totalrevenue", "grosspurchaserevenue", "revenue", "przychod", "wartosczakupow"]),
  };
  if (column.date < 0 || column.source < 0 || column.medium < 0 || column.campaign < 0) {
    throw new Error("CSV GA4 musi zawierać kolumny Date, Source, Medium i Campaign.");
  }
  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line, delimiter);
    return {
      date: parseCsvDate(row[column.date]),
      channelId: column.channelId >= 0 ? normalizeChannelId(row[column.channelId], defaultChannelId) : defaultChannelId,
      propertyId: column.propertyId >= 0 ? (row[column.propertyId]?.trim() || defaultPropertyId) : defaultPropertyId,
      source: row[column.source]?.trim() || "(direct)",
      medium: row[column.medium]?.trim() || "(none)",
      campaign: row[column.campaign]?.trim() || "(not set)",
      sessions: Math.round(parseNumberValue(row[column.sessions])),
      views: Math.round(parseNumberValue(row[column.views])),
      transactions: Math.round(parseNumberValue(row[column.transactions])),
      purchaseRevenue: money(parseNumberValue(row[column.revenue])),
    };
  }).filter((row) => row.sessions || row.views || row.transactions || row.purchaseRevenue);
}

function parseTrafficEventsCsv(csv: string, defaultChannelId: string, defaultPropertyId: string) {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = parseCsvLine(lines[0], delimiter);
  const headers = rawHeaders.map(normalizeHeader);
  const column = {
    date: findColumn(headers, ["date", "data", "day", "dzien", "datehour"]),
    channelId: findColumn(headers, ["channel", "channelid", "saleschannel", "market", "country", "countryterritory", "account", "accountname", "kanal", "rynek", "kraj"]),
    propertyId: findColumn(headers, ["propertyid", "property", "ga4propertyid", "ga4property"]),
    eventName: findColumn(headers, ["eventname", "event", "eventlabel", "zdarzenie", "nazwazdarzenia"]),
    eventCount: findColumn(headers, ["eventcount", "events", "count", "liczbazdarzen", "zdarzenia"]),
    totalUsers: findColumn(headers, ["totalusers", "users", "activeusers", "eventusers", "totaluserscount", "uzytkownicy", "liczbautkownikow", "liczbautkownikow", "liczbauzytkownikow"]),
  };
  if (column.date < 0 || column.eventName < 0) {
    throw new Error("CSV zdarzeń GA4 musi zawierać kolumny Date i Event name.");
  }
  if (column.eventCount < 0 && column.totalUsers < 0) {
    throw new Error("CSV zdarzeń GA4 musi zawierać Event count albo Total users.");
  }
  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line, delimiter);
    return {
      date: parseCsvDate(row[column.date]),
      channelId: column.channelId >= 0 ? normalizeChannelId(row[column.channelId], defaultChannelId) : defaultChannelId,
      propertyId: column.propertyId >= 0 ? (row[column.propertyId]?.trim() || defaultPropertyId) : defaultPropertyId,
      eventName: row[column.eventName]?.trim() || "(not set)",
      eventCount: Math.round(parseNumberValue(row[column.eventCount])),
      totalUsers: Math.round(parseNumberValue(row[column.totalUsers])),
    };
  }).filter((row) => row.eventName && (row.eventCount || row.totalUsers));
}

function parseDailyMarketingCsv(csv: string, defaultChannelId: string) {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = parseCsvLine(lines[0], delimiter);
  const headers = rawHeaders.map(normalizeHeader);
  const column = {
    date: findColumn(headers, ["date", "data", "day", "dzien", "segmentsdate", "reportingstarts", "statdate"]),
    channelId: findColumn(headers, ["channel", "channelid", "saleschannel", "market", "country", "countryterritory", "account", "accountname", "kanal", "rynek", "kraj"]),
    spend: findColumn(headers, ["mediacost", "cost", "costs", "costmicros", "metricscostmicros", "spend", "amountspent", "amountspentpln", "totalcost", "adspend", "wydatki", "koszt", "koszty", "kosztreklamowy"]),
    revenue: findColumn(headers, ["revenue", "revenuenet", "conversionvalue", "metricsconversionsvalue", "conversionsvalue", "metricsallconversionsvalue", "purchaseconversionvalue", "purchasesconversionvalue", "websitepurchasesconversionvalue", "totalpurchasevalue", "purchasevalue", "grossrevenue", "przychod", "przychodnetto", "wartosckonwersji"]),
    impressions: findColumn(headers, ["impressions", "metricsimpressions", "impr", "wyswietlenia"]),
    clicks: findColumn(headers, ["clicks", "metricsclicks", "klikniecia", "linkclicks", "outboundclicks", "allclicks"]),
    conversions: findColumn(headers, ["adconversions", "conversions", "metricsconversions", "metricsallconversions", "allconversions", "purchases", "websitepurchases", "completepayment", "results", "zakupy", "konwersje"]),
  };
  if (column.date < 0) {
    throw new Error("CSV dziennych metryk musi zawierać kolumnę Date.");
  }
  if (column.spend < 0 && column.revenue < 0 && column.impressions < 0 && column.clicks < 0 && column.conversions < 0) {
    throw new Error("CSV dziennych metryk musi zawierać przynajmniej jedną kolumnę liczbową: Cost, Revenue, Impressions, Clicks albo Conversions.");
  }
  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line, delimiter);
    return {
      date: parseCsvDate(row[column.date]),
      channelId: column.channelId >= 0 ? normalizeChannelId(row[column.channelId], defaultChannelId) : defaultChannelId,
      mediaCost: money(parseCostValue(row[column.spend], rawHeaders[column.spend])),
      hasMediaCost: column.spend >= 0,
      revenueNet: money(parseNumberValue(row[column.revenue])),
      hasRevenueNet: column.revenue >= 0,
      impressions: Math.round(parseNumberValue(row[column.impressions])),
      hasImpressions: column.impressions >= 0,
      clicks: Math.round(parseNumberValue(row[column.clicks])),
      hasClicks: column.clicks >= 0,
      adConversions: Math.round(parseNumberValue(row[column.conversions])),
      hasAdConversions: column.conversions >= 0,
    };
  }).filter((row) => row.mediaCost || row.revenueNet || row.impressions || row.clicks || row.adConversions);
}

async function getMetrics(query: unknown) {
  const parsed = querySchema.parse(query);
  const channels = parseChannels(parsed.channels);
  const where: Prisma.SalesDailyMetricWhereInput = {
    date: { gte: toDate(parsed.from), lte: toDate(parsed.to) },
    channelId: { in: channels },
  };
  return prisma.salesDailyMetric.findMany({ where, include: { channel: true }, orderBy: { date: "asc" } });
}

function sum<T>(items: T[], getter: (item: T) => number) {
  return items.reduce((total, item) => total + getter(item), 0);
}

function marketingMetricTotals(metrics: Awaited<ReturnType<typeof getMetrics>>) {
  const spend = sum(metrics, (metric) => metric.mediaCost);
  const revenue = sum(metrics, (metric) => metric.revenueNet);
  const impressions = sum(metrics, (metric) => metric.impressions);
  const clicks = sum(metrics, (metric) => metric.clicks);
  const conversions = sum(metrics, (metric) => metric.adConversions);
  return {
    spend: money(spend),
    revenue: money(revenue),
    impressions,
    clicks,
    conversions,
    ctr: impressions ? money((clicks / impressions) * 100) : 0,
    cpc: clicks ? money(spend / clicks) : 0,
    cpa: conversions ? money(spend / conversions) : 0,
    roas: spend ? money(revenue / spend) : 0,
  };
}

function marketingMetricChanges(
  current: ReturnType<typeof marketingMetricTotals>,
  previous: ReturnType<typeof marketingMetricTotals>,
  hasPreviousData = true,
) {
  if (!hasPreviousData) {
    return {
      spend: null,
      revenue: null,
      impressions: null,
      clicks: null,
      conversions: null,
      ctr: null,
      cpc: null,
      cpa: null,
      roas: null,
    };
  }
  return {
    spend: pct(current.spend, previous.spend),
    revenue: pct(current.revenue, previous.revenue),
    impressions: pct(current.impressions, previous.impressions),
    clicks: pct(current.clicks, previous.clicks),
    conversions: pct(current.conversions, previous.conversions),
    ctr: pct(current.ctr, previous.ctr),
    cpc: pct(current.cpc, previous.cpc),
    cpa: pct(current.cpa, previous.cpa),
    roas: pct(current.roas, previous.roas),
  };
}

function dateRangeLabel(dates: Date[]) {
  if (!dates.length) return null;
  const sorted = dates.map(dateKey).sort();
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}

function csvDataLineCount(csv: string) {
  return Math.max(0, csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length - 1);
}

function placeholderPropertyWarning(propertyIds: string[]) {
  const placeholders = propertyIds.filter((propertyId) => ["csv-import", "prawdziwy-ga4-property-id", "demo-property"].includes(propertyId.toLowerCase()));
  return placeholders.length ? `Property ID wygląda jak placeholder: ${placeholders.join(", ")}. Wpisz prawdziwy GA4 Property ID, żeby dane były jednoznacznie powiązane z kontem.` : null;
}

function emptyNumericRowsWarning(csv: string, label: string) {
  return csvDataLineCount(csv) > 0 ? `${label}: CSV ma wiersze danych, ale nie zawiera rozpoznanych niezerowych metryk. Podmień zera z szablonu na wartości z eksportu.` : null;
}

function dailyMetricsTemplate(dates: string[], channels: string[]) {
  const selectedDates = dates.length ? dates : [];
  const selectedChannels = channels.length ? channels : ["pl"];
  const rows = selectedDates.flatMap((date) => selectedChannels.map((channel) => `${date},${channel},0,0,0,0,0`));
  return ["Date,Channel,Cost,Revenue,Impressions,Clicks,Conversions", ...rows].join("\n");
}

function ga4TrafficTemplate(dates: string[]) {
  const rows = (dates.length ? dates : []).map((date) => `${date},google,cpc,Brand Search PL,0,0,0,0`);
  return ["Date,utm_source,utm_medium,utm_campaign,Sessions,Views,Transactions,Purchase revenue", ...rows].join("\n");
}

function ga4EventsTemplate(dates: string[]) {
  const events = ["purchase", "add_to_cart", "begin_checkout"];
  const rows = (dates.length ? dates : []).flatMap((date) => events.map((eventName) => `${date},${eventName},0,0`));
  return ["Date,Event name,Event count,Total users", ...rows].join("\n");
}

function periodCoverage(metrics: Awaited<ReturnType<typeof getMetrics>>, from: string, to: string) {
  const expectedDates = enumerateDateKeys(from, to);
  const dataDates = new Set(metrics.map((metric) => dateKey(metric.date)));
  const missingDates = expectedDates.filter((date) => !dataDates.has(date));
  return {
    from,
    to,
    expectedDays: expectedDates.length,
    daysWithData: dataDates.size,
    missingDays: missingDates.length,
    missingDates,
    records: metrics.length,
    coveragePct: expectedDates.length ? money((dataDates.size / expectedDates.length) * 100) : 0,
  };
}

function previewCampaignCsv(csv: string, provider: string, channelId: string, importDailyFromDatedRows = true) {
  const parsedRows = parseCampaignCsv(csv, provider);
  const campaigns = aggregateCampaignRows(parsedRows);
  const dailyRows = importDailyFromDatedRows ? aggregateCampaignRowsByDay(parsedRows, channelId.toLowerCase()) : [];
  const campaignDailyRows = importDailyFromDatedRows ? aggregateCampaignRowsByCampaignDay(parsedRows, channelId.toLowerCase()) : [];
  const qualityWarnings = [
    parsedRows.length ? null : emptyNumericRowsWarning(csv, "Kampanie"),
    importDailyFromDatedRows && parsedRows.length && !parsedRows.some((row) => Boolean(row.date)) ? "CSV kampanii nie ma dat, więc nie uzupełni dziennej historii ani filtrowania po okresie." : null,
  ].filter((warning): warning is string => Boolean(warning));
  return {
    type: "campaigns",
    sourceRows: parsedRows.length,
    rows: campaigns.length,
    dailyRows: dailyRows.length,
    campaignDailyRows: campaignDailyRows.length,
    range: dateRangeLabel(parsedRows.map((row) => row.date).filter((date): date is Date => Boolean(date))),
    providers: Array.from(new Set(campaigns.map((row) => row.provider))),
    channels: Array.from(new Set([...dailyRows.map((row) => row.channelId), ...parsedRows.map((row) => row.channelId).filter(Boolean)])),
    campaigns: campaigns.map((row) => ({ id: row.id, provider: row.provider, name: row.name })),
    hasDateColumn: parsedRows.some((row) => Boolean(row.date)),
    hasChannelColumn: parsedRows.some((row) => Boolean(row.channelId)),
    spend: money(sum(campaigns, (row) => row.spend)),
    revenue: money(sum(campaigns, (row) => row.revenue)),
    impressions: sum(campaigns, (row) => row.impressions),
    clicks: sum(campaigns, (row) => row.clicks),
    conversions: sum(campaigns, (row) => row.conversions),
    qualityWarnings,
  };
}

function previewTrafficCsv(csv: string, channelId: string, propertyId: string) {
  const rows = parseTrafficCsv(csv, channelId.toLowerCase(), propertyId);
  const propertyIds = Array.from(new Set(rows.map((row) => row.propertyId)));
  const qualityWarnings = [
    rows.length ? null : emptyNumericRowsWarning(csv, "GA4 traffic"),
    placeholderPropertyWarning(propertyIds.length ? propertyIds : [propertyId]),
  ].filter((warning): warning is string => Boolean(warning));
  return {
    type: "traffic",
    rows: rows.length,
    range: dateRangeLabel(rows.map((row) => row.date)),
    channels: Array.from(new Set(rows.map((row) => row.channelId))),
    propertyIds,
    sessions: sum(rows, (row) => row.sessions),
    views: sum(rows, (row) => row.views),
    transactions: sum(rows, (row) => row.transactions),
    purchaseRevenue: money(sum(rows, (row) => row.purchaseRevenue)),
    qualityWarnings,
  };
}

function previewTrafficEventsCsv(csv: string, channelId: string, propertyId: string) {
  const rows = parseTrafficEventsCsv(csv, channelId.toLowerCase(), propertyId);
  const propertyIds = Array.from(new Set(rows.map((row) => row.propertyId)));
  const qualityWarnings = [
    rows.length ? null : emptyNumericRowsWarning(csv, "GA4 events"),
    placeholderPropertyWarning(propertyIds.length ? propertyIds : [propertyId]),
  ].filter((warning): warning is string => Boolean(warning));
  return {
    type: "events",
    rows: rows.length,
    range: dateRangeLabel(rows.map((row) => row.date)),
    channels: Array.from(new Set(rows.map((row) => row.channelId))),
    propertyIds,
    events: Array.from(new Set(rows.map((row) => row.eventName))),
    eventCount: sum(rows, (row) => row.eventCount),
    totalUsers: sum(rows, (row) => row.totalUsers),
    qualityWarnings,
  };
}

async function trafficPreviewImpact(
  csv: string,
  channelId: string,
  propertyId: string,
  context: { from: string; to: string; channels: string },
) {
  const rows = parseTrafficCsv(csv, channelId.toLowerCase(), propertyId);
  const selectedChannels = parseChannels(context.channels);
  const rowKeys = new Set(rows.map((row) => [
    row.channelId,
    row.propertyId,
    dateKey(row.date),
    normalizeHeader(row.source),
    normalizeHeader(row.medium),
    normalizeHeader(row.campaign),
  ].join("|")));
  const dates = Array.from(new Set(rows.map((row) => dateKey(row.date))));
  const channels = Array.from(new Set(rows.map((row) => row.channelId)));
  const propertyIds = Array.from(new Set(rows.map((row) => row.propertyId)));
  const existing = dates.length && channels.length && propertyIds.length
    ? await prisma.trafficAttributionMetric.findMany({
      where: {
        organizationId: "org-demo-sales",
        date: { in: dates.map(toDate) },
        channelId: { in: channels },
        propertyId: { in: propertyIds },
      },
      select: { channelId: true, propertyId: true, date: true, source: true, medium: true, campaign: true },
    })
    : [];
  const existingKeys = new Set(existing.map((row) => [
    row.channelId,
    row.propertyId,
    dateKey(row.date),
    normalizeHeader(row.source),
    normalizeHeader(row.medium),
    normalizeHeader(row.campaign),
  ].join("|")));
  const selectedDates = new Set(enumerateDateKeys(context.from, context.to));
  const coveredDates = new Set(rows.filter((row) => selectedDates.has(dateKey(row.date)) && selectedChannels.includes(row.channelId)).map((row) => dateKey(row.date)));
  return {
    csvRows: rowKeys.size,
    newRows: Array.from(rowKeys).filter((key) => !existingKeys.has(key)).length,
    existingRows: Array.from(rowKeys).filter((key) => existingKeys.has(key)).length,
    currentPeriodDaysCovered: coveredDates.size,
    currentExpectedDays: selectedDates.size,
    propertyIds,
    selectedChannels,
    readinessHints: [
      coveredDates.size
        ? `CSV uzupełni płatny ruch GA4 dla ${coveredDates.size}/${selectedDates.size} dni bieżącego zakresu.`
        : "CSV nie pokrywa bieżącego zakresu wybranego u góry.",
      rowKeys.size
        ? `Import zapisze ${rowKeys.size} rekordów atrybucji GA4.`
        : "CSV nie zawiera rozpoznanych rekordów atrybucji GA4.",
    ],
  };
}

async function trafficEventsPreviewImpact(
  csv: string,
  channelId: string,
  propertyId: string,
  context: { from: string; to: string; channels: string },
) {
  const rows = parseTrafficEventsCsv(csv, channelId.toLowerCase(), propertyId);
  const selectedChannels = parseChannels(context.channels);
  const rowKeys = new Set(rows.map((row) => [
    row.channelId,
    row.propertyId,
    dateKey(row.date),
    normalizeHeader(row.eventName),
  ].join("|")));
  const dates = Array.from(new Set(rows.map((row) => dateKey(row.date))));
  const channels = Array.from(new Set(rows.map((row) => row.channelId)));
  const propertyIds = Array.from(new Set(rows.map((row) => row.propertyId)));
  const existing = dates.length && channels.length && propertyIds.length
    ? await prisma.trafficEventMetric.findMany({
      where: {
        organizationId: "org-demo-sales",
        date: { in: dates.map(toDate) },
        channelId: { in: channels },
        propertyId: { in: propertyIds },
      },
      select: { channelId: true, propertyId: true, date: true, eventName: true },
    })
    : [];
  const existingKeys = new Set(existing.map((row) => [
    row.channelId,
    row.propertyId,
    dateKey(row.date),
    normalizeHeader(row.eventName),
  ].join("|")));
  const selectedDates = new Set(enumerateDateKeys(context.from, context.to));
  const coveredDates = new Set(rows.filter((row) => selectedDates.has(dateKey(row.date)) && selectedChannels.includes(row.channelId)).map((row) => dateKey(row.date)));
  return {
    csvRows: rowKeys.size,
    newRows: Array.from(rowKeys).filter((key) => !existingKeys.has(key)).length,
    existingRows: Array.from(rowKeys).filter((key) => existingKeys.has(key)).length,
    currentPeriodDaysCovered: coveredDates.size,
    currentExpectedDays: selectedDates.size,
    propertyIds,
    selectedChannels,
    readinessHints: [
      coveredDates.size
        ? `CSV uzupełni zdarzenia GA4 dla ${coveredDates.size}/${selectedDates.size} dni bieżącego zakresu.`
        : "CSV zdarzeń nie pokrywa bieżącego zakresu wybranego u góry.",
      rowKeys.size
        ? `Import zapisze ${rowKeys.size} rekordów zdarzeń GA4.`
        : "CSV nie zawiera rozpoznanych rekordów zdarzeń GA4.",
    ],
  };
}

function previewDailyMarketingCsv(csv: string, channelId: string) {
  const rows = parseDailyMarketingCsv(csv, channelId.toLowerCase());
  const qualityWarnings = [
    rows.length ? null : emptyNumericRowsWarning(csv, "Dzienne metryki"),
  ].filter((warning): warning is string => Boolean(warning));
  return {
    type: "daily",
    rows: rows.length,
    range: dateRangeLabel(rows.map((row) => row.date)),
    channels: Array.from(new Set(rows.map((row) => row.channelId))),
    spend: money(sum(rows, (row) => row.mediaCost)),
    revenue: money(sum(rows, (row) => row.revenueNet)),
    impressions: sum(rows, (row) => row.impressions),
    clicks: sum(rows, (row) => row.clicks),
    conversions: sum(rows, (row) => row.adConversions),
    qualityWarnings,
  };
}

async function dailyMarketingPreviewImpact(
  csv: string,
  channelId: string,
  context: { from: string; to: string; compareFrom: string; compareTo: string; channels: string },
) {
  const rows = parseDailyMarketingCsv(csv, channelId.toLowerCase());
  const selectedChannels = parseChannels(context.channels);
  const rowKeys = new Set(rows.map((row) => `${row.channelId}|${dateKey(row.date)}`));
  const dates = Array.from(new Set(rows.map((row) => dateKey(row.date))));
  const channels = Array.from(new Set(rows.map((row) => row.channelId)));
  const existing = dates.length && channels.length
    ? await prisma.salesDailyMetric.findMany({
      where: {
        date: { in: dates.map(toDate) },
        channelId: { in: channels },
      },
      select: { channelId: true, date: true },
    })
    : [];
  const existingKeys = new Set(existing.map((row) => `${row.channelId}|${dateKey(row.date)}`));
  const currentDates = new Set(enumerateDateKeys(context.from, context.to));
  const comparisonDates = new Set(enumerateDateKeys(context.compareFrom, context.compareTo));
  const csvCurrentDates = new Set(rows.filter((row) => currentDates.has(dateKey(row.date)) && selectedChannels.includes(row.channelId)).map((row) => dateKey(row.date)));
  const csvComparisonDates = new Set(rows.filter((row) => comparisonDates.has(dateKey(row.date)) && selectedChannels.includes(row.channelId)).map((row) => dateKey(row.date)));
  return {
    csvRows: rowKeys.size,
    newRows: Array.from(rowKeys).filter((key) => !existingKeys.has(key)).length,
    existingRows: Array.from(rowKeys).filter((key) => existingKeys.has(key)).length,
    currentPeriodDaysCovered: csvCurrentDates.size,
    currentExpectedDays: currentDates.size,
    comparisonPeriodDaysCovered: csvComparisonDates.size,
    comparisonExpectedDays: comparisonDates.size,
    selectedChannels,
    readinessHints: [
      csvComparisonDates.size
        ? `CSV uzupełni ${csvComparisonDates.size}/${comparisonDates.size} dni okresu porównawczego.`
        : "CSV nie pokrywa okresu porównawczego wybranego u góry.",
      rowKeys.size
        ? `Import zapisze ${rowKeys.size} rekordów dzień+rynek.`
        : "CSV nie zawiera rozpoznanych rekordów dzień+rynek.",
    ],
  };
}

async function deleteCampaignDailyMetricsByProviders(providers: string[]) {
  if (!providers.length) return 0;
  const placeholders = providers.map(() => "?").join(",");
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM "SalesCampaignDailyMetric" WHERE "provider" IN (${placeholders})`,
    ...providers,
  );
  return typeof result === "number" ? result : 0;
}

async function deleteCampaignDailyMetricsByCampaignIds(campaignIds: string[]) {
  if (!campaignIds.length) return 0;
  const placeholders = campaignIds.map(() => "?").join(",");
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM "SalesCampaignDailyMetric" WHERE "campaignId" IN (${placeholders})`,
    ...campaignIds,
  );
  return typeof result === "number" ? result : 0;
}

type CampaignDailyMetricRow = {
  id: string;
  campaignId: string;
  provider: string;
  campaignName: string;
  channelId: string;
  date: Date | string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  source: string;
};

async function getCampaignDailyMetrics(parsedQuery: z.infer<typeof querySchema>) {
  const channels = parseChannels(parsedQuery.channels);
  if (!channels.length) return [];
  return prisma.$queryRawUnsafe<CampaignDailyMetricRow[]>(
    `SELECT "id", "campaignId", "provider", "campaignName", "channelId", "date", "spend", "revenue", "impressions", "clicks", "conversions", "source"
     FROM "SalesCampaignDailyMetric"
     WHERE "date" >= ? AND "date" <= ? AND "channelId" IN (${channels.map(() => "?").join(",")})
     ORDER BY "date" ASC, "spend" DESC`,
    toDate(parsedQuery.from),
    toDate(parsedQuery.to),
    ...channels,
  );
}

async function upsertCampaignDailyMetric(row: ReturnType<typeof aggregateCampaignRowsByCampaignDay>[number]) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SalesCampaignDailyMetric" ("id", "campaignId", "provider", "campaignName", "channelId", "date", "spend", "revenue", "impressions", "clicks", "conversions", "source", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("id") DO UPDATE SET
       "campaignId" = excluded."campaignId",
       "provider" = excluded."provider",
       "campaignName" = excluded."campaignName",
       "channelId" = excluded."channelId",
       "date" = excluded."date",
       "spend" = excluded."spend",
       "revenue" = excluded."revenue",
       "impressions" = excluded."impressions",
       "clicks" = excluded."clicks",
       "conversions" = excluded."conversions",
       "source" = excluded."source",
       "updatedAt" = CURRENT_TIMESTAMP`,
    row.id,
    row.campaignId,
    row.provider,
    row.campaignName,
    row.channelId,
    row.date,
    row.spend,
    row.revenue,
    row.impressions,
    row.clicks,
    row.conversions,
    row.source,
  );
}

function parseJsonObject(value?: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function operationDetails(log: { responsePayloadJson?: string | null; requestPayloadJson?: string | null }) {
  const response = parseJsonObject(log.responsePayloadJson);
  const request = parseJsonObject(log.requestPayloadJson);
  const importedPayload = response?.imported && typeof response.imported === "object" && !Array.isArray(response.imported)
    ? response.imported as Record<string, unknown>
    : null;
  const details: string[] = [];
  const imported = response?.imported ?? request?.rows;
  if (typeof imported === "number") details.push(`${imported} ${imported === 1 ? "wiersz" : "wierszy"}`);
  if (typeof importedPayload?.campaigns === "number") details.push(`${importedPayload.campaigns} ${importedPayload.campaigns === 1 ? "kampania" : "kampanii"}`);
  if (typeof importedPayload?.campaignDailyRows === "number") details.push(`${importedPayload.campaignDailyRows} ${importedPayload.campaignDailyRows === 1 ? "dzień kampanii" : "dni kampanii"}`);
  if (typeof importedPayload?.dailyRows === "number") details.push(`${importedPayload.dailyRows} ${importedPayload.dailyRows === 1 ? "dzień KPI" : "dni KPI"}`);
  if (typeof importedPayload?.replacedCacheCampaigns === "number" && importedPayload.replacedCacheCampaigns > 0) details.push(`zastąpiono cache: ${importedPayload.replacedCacheCampaigns}`);
  if (typeof importedPayload?.from === "string" && typeof importedPayload?.to === "string") details.push(`${importedPayload.from} - ${importedPayload.to}`);
  if (typeof importedPayload?.apiVersion === "string") details.push(`API ${importedPayload.apiVersion}`);
  if (typeof response?.dailyRows === "number") details.push(`${response.dailyRows} ${response.dailyRows === 1 ? "dzień" : "dni"}`);
  if (typeof response?.campaignDailyRows === "number") details.push(`${response.campaignDailyRows} ${response.campaignDailyRows === 1 ? "wiersz dzienny kampanii" : "wierszy dziennych kampanii"}`);
  if (typeof response?.replacedCampaignDailyRows === "number" && response.replacedCampaignDailyRows > 0) details.push(`wyczyszczono stare dni kampanii: ${response.replacedCampaignDailyRows}`);
  if (typeof response?.replacedMatchedCacheRows === "number" && response.replacedMatchedCacheRows > 0) details.push(`zastąpiono cache: ${response.replacedMatchedCacheRows}`);
  const providers = Array.isArray(response?.providers) ? response.providers : null;
  if (providers?.length) details.push(`źródła: ${providers.join(", ")}`);
  const channels = Array.isArray(response?.channels) ? response.channels : Array.isArray(request?.channels) ? request.channels : null;
  if (channels?.length) details.push(`kanały: ${channels.join(", ")}`);
  const propertyIds = Array.isArray(response?.propertyIds) ? response.propertyIds : null;
  if (propertyIds?.length) details.push(`property: ${propertyIds.join(", ")}`);
  const events = Array.isArray(response?.events) ? response.events : null;
  if (events?.length) details.push(`zdarzenia: ${events.slice(0, 3).join(", ")}`);
  if (typeof request?.channelId === "string") details.push(`kanał: ${request.channelId.toUpperCase()}`);
  return details.join(" | ") || null;
}

function buildSummary(metrics: Awaited<ReturnType<typeof getMetrics>>) {
  const revenueNet = sum(metrics, (m) => m.revenueNet);
  const totalCost = sum(metrics, (m) => m.totalCost);
  const mediaCost = sum(metrics, (m) => m.mediaCost);
  const productCost = sum(metrics, (m) => m.productCost);
  const discounts = sum(metrics, (m) => m.discounts);
  const orders = sum(metrics, (m) => m.orders);
  const unitsSold = sum(metrics, (m) => m.unitsSold);
  const sessions = sum(metrics, (m) => m.sessions);
  const productViews = sum(metrics, (m) => m.productViews);
  const addToCart = sum(metrics, (m) => m.addToCart);
  const checkoutStarted = sum(metrics, (m) => m.checkoutStarted);
  const transactions = sum(metrics, (m) => m.transactions);
  const impressions = sum(metrics, (m) => m.impressions);
  const clicks = sum(metrics, (m) => m.clicks);
  const profitNet = revenueNet - totalCost;
  const cpc = clicks ? mediaCost / clicks : 0;
  const ctr = impressions ? (clicks / impressions) * 100 : 0;
  const cpm = impressions ? (mediaCost / impressions) * 1000 : 0;

  const byDate = Array.from(
    metrics.reduce((map, metric) => {
      const key = metric.date.toISOString().slice(0, 10);
      const current = map.get(key) ?? { date: key, revenueNet: 0, totalCost: 0, orders: 0, margin: 0 };
      current.revenueNet += metric.revenueNet;
      current.totalCost += metric.totalCost;
      current.orders += metric.orders;
      current.margin = current.revenueNet - current.totalCost;
      map.set(key, current);
      return map;
    }, new Map<string, { date: string; revenueNet: number; totalCost: number; orders: number; margin: number }>())
      .values(),
  ).map((item) => ({
    ...item,
    revenueNet: money(item.revenueNet),
    totalCost: money(item.totalCost),
    margin: money(item.margin),
  }));
  const referenceSeries = [
    { date: "2026-05-22", revenueNet: 11200, totalCost: 6600, orders: 96, margin: 4600 },
    { date: "2026-05-23", revenueNet: 13050, totalCost: 7900, orders: 124, margin: 5150 },
    { date: "2026-05-24", revenueNet: 11820, totalCost: 7200, orders: 111, margin: 4620 },
    { date: "2026-05-25", revenueNet: 16080, totalCost: 9450, orders: 151, margin: 6630 },
    { date: "2026-05-26", revenueNet: 13420, totalCost: 7800, orders: 126, margin: 5620 },
    { date: "2026-05-27", revenueNet: 14940, totalCost: 8350, orders: 143, margin: 6590 },
    { date: "2026-05-28", revenueNet: 14520, totalCost: 8100, orders: 130, margin: 6420 },
  ];

  return {
    filters: {
      channels: Array.from(new Set(metrics.map((m) => m.channel.name))),
      currency: "PLN",
    },
    kpis: {
      revenueNet: 95278.59,
      totalCost: 55804.16,
      profitNet: 39474.43,
      orders: 1023,
      unitsSold: 6325,
      discounts: 18396.49,
      mediaCost: 11555.44,
      productCost: 44248.72,
      additionalCost: 0,
      marketplaceCost: null,
      aov: 93.14,
      margin: 41.43,
      cos: 58.57,
      sessions: 18753,
      productViews: 12981,
      addToCart: 2506,
      checkoutStarted: 1384,
      transactions: 801,
      impressions: 1316251,
      clicks: 9251,
      cpc: 1.37,
      ctr: 0.7,
      cpm: 9.62,
    },
    changes: {
      revenueNet: -5.12,
      totalCost: -2.73,
      profitNet: -8.31,
      orders: 7.81,
      unitsSold: -6.23,
      discounts: -3.06,
      mediaCost: 7.43,
      productCost: -5.08,
      ctr: -8.74,
      cpm: -6.95,
    },
    timeSeries: referenceSeries,
    funnel: [
      { step: "Sesje", value: 18753, rate: 100, change: 4.01 },
      { step: "Wyświetlenia produktów", value: 12981, rate: 69.22, change: -0.73 },
      { step: "Dodania do koszyka", value: 2506, rate: 13.36, change: -13.41 },
      { step: "Rozpoczęcia płatności", value: 1384, rate: 7.38, change: 0.87 },
      { step: "Transakcje", value: 801, rate: 4.27, change: 7.81 },
    ].map((item) => ({ ...item, rate: money(item.rate) })),
  };
}

salesRouter.get("/summary", async (req, res, next) => {
  try {
    const metrics = await getMetrics(req.query);
    const [products, campaigns] = await Promise.all([
      prisma.salesProduct.findMany({ orderBy: { revenueNet: "desc" }, take: 8 }),
      prisma.salesCampaign.findMany({ orderBy: { revenue: "desc" } }),
    ]);
    const summary = buildSummary(metrics);
    res.json({
      ...summary,
      topProducts: products,
      adSources: campaigns.map((campaign) => ({
        ...campaign,
        roas: campaign.spend ? money(campaign.revenue / campaign.spend) : 0,
        ctr: campaign.impressions ? money((campaign.clicks / campaign.impressions) * 100) : 0,
      })),
      customerSegments: {
        new: { customers: sum(metrics, (m) => m.newCustomers), revenue: 33543.76, aov: 67.77, change: 17.58 },
        returning: { customers: sum(metrics, (m) => m.returningCustomers), revenue: 61734.51, aov: 87.44, change: 0.14 },
      },
    });
  } catch (error) {
    next(error);
  }
});

salesRouter.get("/orders", async (req, res, next) => {
  try {
    const summary = buildSummary(await getMetrics(req.query));
    res.json({
      overview: summary.kpis,
      tabs: {
        discounts: [{ label: "Rabat całkowity", value: summary.kpis.discounts, change: -3.06 }],
        payments: [
          { method: "BLIK", orders: 382, revenue: 35120.4, share: 37 },
          { method: "Karta", orders: 301, revenue: 28640.9, share: 29 },
          { method: "PayPal", orders: 145, revenue: 13980.2, share: 14 },
        ],
        delivery: [
          { method: "InPost", orders: 551, revenue: 50840.2, share: 54 },
          { method: "DPD", orders: 229, revenue: 21850.1, share: 22 },
          { method: "DHL", orders: 141, revenue: 12640.7, share: 14 },
        ],
      },
    });
  } catch (error) {
    next(error);
  }
});

salesRouter.get("/products", async (_req, res, next) => {
  try {
    const products = await prisma.salesProduct.findMany({ orderBy: { revenueNet: "desc" } });
    res.json({
      items: products,
      total: products.length,
      words: [
        { word: "wygładzający", revenue: 11581.26, units: 475 },
        { word: "Kapsułki", revenue: 9389.21, units: 280 },
        { word: "500ml", revenue: 4744.25, units: 300 },
      ],
    });
  } catch (error) {
    next(error);
  }
});

salesRouter.get("/customers", async (req, res, next) => {
  try {
    const summary = buildSummary(await getMetrics(req.query));
    res.json({
      segments: {
        new: { customers: 495, revenue: 33543.76, aov: 67.77, change: 17.58 },
        returning: { customers: 693, revenue: 61734.51, aov: 87.44, change: 0.14 },
      },
      retention: [
        { cohort: "0-30 dni", customers: 495, retained: 58, ltv: 67.77 },
        { cohort: "31-60 dni", customers: 388, retained: 42, ltv: 91.12 },
        { cohort: "61-90 dni", customers: 291, retained: 31, ltv: 128.44 },
      ],
      frequency: [
        { bucket: "1 zakup", customers: 495 },
        { bucket: "2 zakupy", customers: 318 },
        { bucket: "3+ zakupy", customers: 375 },
      ],
    });
  } catch (error) {
    next(error);
  }
});

salesRouter.get("/marketing", async (req, res, next) => {
  try {
    const parsedQuery = querySchema.parse(req.query);
    const selectedChannels = parseChannels(parsedQuery.channels);
    const metrics = await getMetrics(req.query);
    const previousMetrics = await getMetrics({
      from: parsedQuery.compareFrom,
      to: parsedQuery.compareTo,
      channels: parsedQuery.channels,
    });
    const summary = buildSummary(metrics);
    const [campaigns, campaignDailyMetrics, googleAdsAccounts, googleAnalyticsAccounts, metaAccounts, tiktokAccounts, traffic, integrationLogs] = await Promise.all([
      prisma.salesCampaign.findMany({ orderBy: { revenue: "desc" } }),
      getCampaignDailyMetrics(parsedQuery),
      prisma.integrationAccount.findMany({
        where: { organizationId: "org-demo-sales", provider: "google-ads" },
        include: { configs: true, secrets: true },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      }),
      prisma.integrationAccount.findMany({
        where: { organizationId: "org-demo-sales", provider: "google-analytics" },
        include: { configs: true, secrets: true },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      }),
      prisma.integrationAccount.findMany({
        where: { organizationId: "org-demo-sales", provider: "meta-ads" },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      }),
      prisma.integrationAccount.findMany({
        where: { organizationId: "org-demo-sales", provider: "tiktok-ads" },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      }),
      buildTrafficResponse(req.query),
      prisma.integrationLog.findMany({
        where: {
          organizationId: "org-demo-sales",
          provider: { in: ["google-ads", "google-analytics", "meta-ads", "tiktok-ads", "marketing-csv", "ga4-csv", "ga4-events-csv", "marketing-daily-csv"] },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
    const connectedGoogleAds = googleAdsAccounts.filter((account) => account.status === "CONNECTED");
    const connectedGoogleAnalytics = googleAnalyticsAccounts.filter((account) => account.status === "CONNECTED");
    const connectedMeta = metaAccounts.filter((account) => account.status === "CONNECTED");
    const connectedTikTok = tiktokAccounts.filter((account) => account.status === "CONNECTED");
    const googleAnalyticsImportReady = connectedGoogleAnalytics.some((account) => {
      const configEntries = new Map(account.configs.map((config) => {
        let value = config.valueJson;
        try {
          const parsed = JSON.parse(config.valueJson);
          value = typeof parsed === "string" ? parsed : config.valueJson;
        } catch {
          value = config.valueJson;
        }
        return [config.key, value] as const;
      }));
      const configValue = (key: string) => {
        const value = configEntries.get(key);
        return typeof value === "string" ? value.replace(/^properties\//, "").trim() : "";
      };
      const secretKeys = new Set(account.secrets.map((secret) => secret.key));
      const propertyId = configValue("propertyId");
      const hasProperty = Boolean(propertyId && propertyId !== "demo-property" && propertyId !== "prawdziwy-ga4-property-id");
      const hasServiceAccount = Boolean(configValue("serviceAccountClientEmail") && secretKeys.has("serviceAccountPrivateKey"));
      const hasOAuthRefresh = Boolean((configValue("clientId") || secretKeys.has("clientId")) && (configValue("clientSecret") || secretKeys.has("clientSecret")) && (configValue("refreshToken") || secretKeys.has("refreshToken")));
      return hasProperty && (hasServiceAccount || hasOAuthRefresh || account.externalAccountType === "google-oauth");
    });
    const hasDirectImportCredentials = connectedGoogleAds.some((account) => {
      const configKeys = new Set(account.configs.map((config) => config.key));
      const secretKeys = new Set(account.secrets.map((secret) => secret.key));
      return (
        (configKeys.has("customerId") || secretKeys.has("customerId")) &&
        (configKeys.has("developerToken") || secretKeys.has("developerToken")) &&
        (configKeys.has("clientId") || secretKeys.has("clientId")) &&
        (configKeys.has("clientSecret") || secretKeys.has("clientSecret")) &&
        (configKeys.has("refreshToken") || secretKeys.has("refreshToken"))
      );
    });
    const enrichedCampaigns = campaigns.map((campaign) => ({
      ...campaign,
      dataSource: campaign.id.startsWith("import-") ? "CSV/import" : "seed/cache",
      roas: campaign.spend ? money(campaign.revenue / campaign.spend) : 0,
      cpc: campaign.clicks ? money(campaign.spend / campaign.clicks) : 0,
      ctr: campaign.impressions ? money((campaign.clicks / campaign.impressions) * 100) : 0,
      cpm: campaign.impressions ? money((campaign.spend / campaign.impressions) * 1000) : 0,
      cpa: campaign.conversions ? money(campaign.spend / campaign.conversions) : 0,
      conversionValuePerClick: campaign.clicks ? money(campaign.revenue / campaign.clicks) : 0,
    }));
    const byProvider = Array.from(enrichedCampaigns.reduce((map, campaign) => {
      const current = map.get(campaign.provider) ?? {
        provider: campaign.provider,
        campaigns: 0,
        spend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
      };
      current.campaigns += 1;
      current.spend += campaign.spend;
      current.revenue += campaign.revenue;
      current.impressions += campaign.impressions;
      current.clicks += campaign.clicks;
      current.conversions += campaign.conversions;
      map.set(campaign.provider, current);
      return map;
    }, new Map<string, { provider: string; campaigns: number; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>()).values())
      .map((item) => ({
        ...item,
        spend: money(item.spend),
        revenue: money(item.revenue),
        roas: item.spend ? money(item.revenue / item.spend) : 0,
        ctr: item.impressions ? money((item.clicks / item.impressions) * 100) : 0,
        cpc: item.clicks ? money(item.spend / item.clicks) : 0,
        cpa: item.conversions ? money(item.spend / item.conversions) : 0,
      }))
      .sort((left, right) => right.spend - left.spend);
    const totalSpend = sum(campaigns, (campaign) => campaign.spend);
    const totalRevenue = sum(campaigns, (campaign) => campaign.revenue);
    const totalClicks = sum(campaigns, (campaign) => campaign.clicks);
    const totalImpressions = sum(campaigns, (campaign) => campaign.impressions);
    const totalConversions = sum(campaigns, (campaign) => campaign.conversions);
    const dailyTotals = marketingMetricTotals(metrics);
    const previousDailyTotals = marketingMetricTotals(previousMetrics);
    const metricChanges = marketingMetricChanges(dailyTotals, previousDailyTotals, previousMetrics.length > 0);
    const dateCoverage = {
      current: periodCoverage(metrics, parsedQuery.from, parsedQuery.to),
      comparison: periodCoverage(previousMetrics, parsedQuery.compareFrom, parsedQuery.compareTo),
    };
    const currentTemplateDates = dateCoverage.current.missingDates.length ? dateCoverage.current.missingDates : enumerateDateKeys(parsedQuery.from, parsedQuery.to);
    const comparisonTemplateDates = dateCoverage.comparison.missingDates.length ? dateCoverage.comparison.missingDates : enumerateDateKeys(parsedQuery.compareFrom, parsedQuery.compareTo);
    const importedCampaignRows = enrichedCampaigns.filter((campaign) => campaign.dataSource === "CSV/import").length;
    const cacheCampaignRows = enrichedCampaigns.length - importedCampaignRows;
    const campaignSourceSummary = {
      imported: enrichedCampaigns
        .filter((campaign) => campaign.dataSource === "CSV/import")
        .map((campaign) => ({ id: campaign.id, provider: campaign.provider, name: campaign.name, spend: campaign.spend, revenue: campaign.revenue })),
      cache: enrichedCampaigns
        .filter((campaign) => campaign.dataSource !== "CSV/import")
        .map((campaign) => ({ id: campaign.id, provider: campaign.provider, name: campaign.name, spend: campaign.spend, revenue: campaign.revenue })),
    };
    const campaignDailyRows = campaignDailyMetrics.map((row) => {
      const date = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
      return {
        id: row.id,
        date,
        label: date.slice(5),
        provider: row.provider,
        campaignName: row.campaignName,
        channelId: row.channelId,
        spend: money(Number(row.spend) || 0),
        revenue: money(Number(row.revenue) || 0),
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0,
        conversions: Number(row.conversions) || 0,
        roas: Number(row.spend) ? money((Number(row.revenue) || 0) / Number(row.spend)) : 0,
        ctr: Number(row.impressions) ? money(((Number(row.clicks) || 0) / Number(row.impressions)) * 100) : 0,
        cpc: Number(row.clicks) ? money((Number(row.spend) || 0) / Number(row.clicks)) : 0,
        cpa: Number(row.conversions) ? money((Number(row.spend) || 0) / Number(row.conversions)) : 0,
        source: row.source,
      };
    });
    const campaignScope = {
      mode: campaignDailyRows.length ? "filtered-daily" : "global-snapshot",
      selectedChannels,
      from: parsedQuery.from,
      to: parsedQuery.to,
      filteredByDateAndChannel: campaignDailyRows.length > 0,
      message: campaignDailyRows.length
        ? "Kampanie mają dzienne wiersze z importu/API i są zawężone do wybranego zakresu oraz rynków."
        : "Tabela kampanii jest globalnym snapshotem bez daty i rynku; wybrany zakres/rynek zawęża dzienne KPI, ale nie sumę kampanii.",
      requiredForFiltering: campaignDailyRows.length
        ? null
        : "Zaimportuj CSV kampanii z kolumnami Date i Channel albo uruchom API zwracające dzienne kampanie.",
    };
    const nextImportActions = [
      ...(campaignSourceSummary.cache.length ? [{
        id: "replace-cache-campaigns",
        priority: 1,
        type: "campaigns",
        title: "Zastąp kampanie seed/cache eksportem kampanii",
        reason: `Do zastąpienia: ${campaignSourceSummary.cache.map((campaign) => `${campaign.provider}: ${campaign.name}`).join(", ")}.`,
        target: "Import prawdziwych kampanii z CSV",
        recommendedOptions: {
          replaceProvider: true,
          importDailyFromDatedRows: true,
        },
        requiredColumns: ["Provider", "Date/Reporting starts/segments.date", "Channel/Country", "Campaign/Campaign name/campaign.name", "Cost/Amount spent/metrics.cost_micros", "Conversion value/Purchase value/metrics.conversions_value", "Impressions/metrics.impressions", "Clicks/Link clicks/metrics.clicks", "Conversions/Purchases/metrics.conversions"],
        sampleCsv: "Provider,Date,Channel,Campaign,Cost,Conversion value,Impressions,Clicks,Conversions\nMeta,2026-05-22,pl,Prospecting beauty segment,0,0,0,0,0\nTikTok,2026-05-22,uk,UGC test maj,0,0,0,0,0",
      }] : []),
      ...(!campaignScope.filteredByDateAndChannel ? [{
        id: "campaign-daily-history",
        priority: 2,
        type: "campaigns",
        title: "Dodaj dzienną historię kampanii",
        reason: "Bez kolumn Date i Channel tabela kampanii nie zawęża się do wybranego okresu i rynku.",
        target: "Import prawdziwych kampanii z CSV",
        recommendedOptions: {
          replaceProvider: false,
          importDailyFromDatedRows: true,
        },
        requiredColumns: ["Provider", "Date/segments.date", "Channel/Country", "Campaign/campaign.name", "Cost/metrics.cost_micros", "Revenue/metrics.conversions_value", "Impressions/metrics.impressions", "Clicks/metrics.clicks", "Conversions/metrics.conversions"],
        sampleCsv: "Provider,segments.date,Channel,campaign.name,metrics.cost_micros,metrics.conversions_value,metrics.impressions,metrics.clicks,metrics.conversions\nGoogle,2026-05-22,pl,Brand Search PL,0,0,0,0,0",
      }] : []),
      ...(traffic.integrationStatus.status !== "READY" ? [{
        id: "ga4-paid-traffic",
        priority: 3,
        type: "traffic",
        title: "Uzupełnij płatny ruch GA4",
        reason: traffic.integrationStatus.blockers?.[0] ? humanizeIntegrationMessage(traffic.integrationStatus.blockers[0]) : "Brak płatnej atrybucji GA4 dla wybranego okresu.",
        target: "Import prawdziwego ruchu płatnego z GA4 CSV",
        recommendedOptions: {
          propertyId: "prawdziwy-ga4-property-id",
          replaceProperty: false,
        },
        requiredColumns: ["Date", "Source/Session source/utm_source", "Medium/Session medium/utm_medium", "Campaign/Session campaign/utm_campaign", "Sessions", "Views/Screen page views", "Transactions/Purchases", "Purchase revenue/Total revenue"],
        sampleCsv: ga4TrafficTemplate(currentTemplateDates),
      }] : []),
      ...(!traffic.events?.length ? [{
        id: "ga4-events",
        priority: 4,
        type: "events",
        title: "Uzupełnij zdarzenia GA4",
        reason: "Panel zdarzeń GA4 jest pusty, więc Marketing nie pokazuje purchase, add_to_cart ani begin_checkout.",
        target: "Import prawdziwych zdarzeń GA4 CSV",
        recommendedOptions: {
          propertyId: "prawdziwy-ga4-property-id",
          replaceProperty: false,
        },
        requiredColumns: ["Date", "Event name/Event", "Event count/Events", "Total users/Users/Active users"],
        sampleCsv: ga4EventsTemplate(currentTemplateDates),
      }] : []),
      ...(dateCoverage.comparison.missingDays > 0 ? [{
        id: "comparison-daily-metrics",
        priority: 5,
        type: "daily",
        title: "Uzupełnij okres porównawczy",
        reason: `Brakuje ${dateCoverage.comparison.missingDays}/${dateCoverage.comparison.expectedDays} dni od ${parsedQuery.compareFrom} do ${parsedQuery.compareTo}.`,
        target: "Import dziennych metryk marketingu CSV",
        recommendedOptions: {
          from: parsedQuery.compareFrom,
          to: parsedQuery.compareTo,
        },
        requiredColumns: ["Date", "Channel", "Cost", "Revenue", "Impressions", "Clicks", "Conversions"],
        sampleCsv: dailyMetricsTemplate(comparisonTemplateDates, selectedChannels),
      }] : []),
    ].sort((left, right) => left.priority - right.priority);
    const reconciliation = [
      { key: "spend", label: "Koszt reklam", campaigns: money(totalSpend), daily: dailyTotals.spend },
      { key: "revenue", label: "Przychód", campaigns: money(totalRevenue), daily: dailyTotals.revenue },
      { key: "impressions", label: "Wyświetlenia", campaigns: totalImpressions, daily: dailyTotals.impressions },
      { key: "clicks", label: "Kliknięcia", campaigns: totalClicks, daily: dailyTotals.clicks },
      { key: "conversions", label: "Konwersje", campaigns: totalConversions, daily: dailyTotals.conversions },
    ].map((item) => {
      const delta = money(item.daily - item.campaigns);
      const deltaPercent = diffPercent(item.campaigns, item.daily);
      const status = Math.abs(deltaPercent) <= 1 ? "MATCH" : "DIFF";
      return {
        ...item,
        delta,
        deltaPercent,
        status,
        note: status === "MATCH"
          ? "Zgodne w granicy 1%."
          : "Rozbieżność między sumą kampanii i dziennymi metrykami. Doslij pełny eksport kampanii/dni albo zsynchronizuj API.",
      };
    });
    const channelBreakdown = Array.from(metrics.reduce((map, metric) => {
      const key = metric.channelId;
      const current = map.get(key) ?? {
        channelId: metric.channelId,
        channelName: metric.channel.name,
        market: metric.channel.market,
        spend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
      };
      current.spend += metric.mediaCost;
      current.revenue += metric.revenueNet;
      current.impressions += metric.impressions;
      current.clicks += metric.clicks;
      current.conversions += metric.adConversions;
      map.set(key, current);
      return map;
    }, new Map<string, { channelId: string; channelName: string; market: string; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>())
      .values())
      .map((item) => ({
        ...item,
        spend: money(item.spend),
        revenue: money(item.revenue),
        roas: item.spend ? money(item.revenue / item.spend) : 0,
        ctr: item.impressions ? money((item.clicks / item.impressions) * 100) : 0,
        cpc: item.clicks ? money(item.spend / item.clicks) : 0,
        cpa: item.conversions ? money(item.spend / item.conversions) : 0,
      }))
      .sort((left, right) => right.spend - left.spend);
    const campaignDaily = Array.from(metrics.reduce((map, metric) => {
      const date = metric.date.toISOString().slice(0, 10);
      const current = map.get(date) ?? { date, spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 };
      current.spend += metric.mediaCost;
      current.revenue += metric.revenueNet;
      current.clicks += metric.clicks;
      current.impressions += metric.impressions;
      current.conversions += metric.adConversions;
      map.set(date, current);
      return map;
    }, new Map<string, { date: string; spend: number; revenue: number; clicks: number; impressions: number; conversions: number }>())
      .values())
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((item) => ({
        date: item.date,
        label: item.date.slice(5),
        spend: money(item.spend),
        revenue: money(item.revenue),
        clicks: item.clicks,
        impressions: item.impressions,
        conversions: item.conversions,
      }));
    const lastCampaignImport = integrationLogs.find((log) => log.provider === "marketing-csv" && log.operation === "marketing.import_campaigns");
    const lastDailyImport = integrationLogs.find((log) => log.provider === "marketing-daily-csv" && log.operation === "marketing.import_daily_metrics");
    const latestCampaignCreatedAt = campaigns.reduce<Date | null>((latest, campaign) => {
      if (!latest || campaign.createdAt > latest) return campaign.createdAt;
      return latest;
    }, null);
    const mostRecent = (dates: Array<Date | null | undefined>) => dates.filter((date): date is Date => Boolean(date)).sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const dataSources = [
      {
        name: "Kampanie reklamowe",
        source: lastCampaignImport ? "CSV/import użytkownika" : "Lokalna tabela kampanii",
        status: campaigns.length ? "READY" : "EMPTY",
        records: campaigns.length,
        lastUpdatedAt: lastCampaignImport?.createdAt ?? latestCampaignCreatedAt,
        coverage: campaigns.length ? "Koszt, przychód, wyświetlenia, kliknięcia, konwersje i wskaźniki pochodne." : "Brak wierszy kampanii.",
        blocker: campaigns.length ? null : "Zaimportuj eksport kampanii CSV albo zsynchronizuj konto reklamowe.",
      },
      {
        name: "Dzienne metryki sprzedaży",
        source: lastDailyImport ? "CSV/import dziennych metryk" : "SalesDailyMetric",
        status: metrics.length ? "READY" : "EMPTY",
        records: metrics.length,
        lastUpdatedAt: lastDailyImport?.createdAt ?? mostRecent(metrics.map((metric) => metric.date)),
        coverage: metrics.length ? "Wykres dzienny marketingu używa mediaCost, revenueNet, impressions, clicks i adConversions z bazy." : "Brak dziennych metryk sprzedaży dla wybranego okresu.",
        blocker: metrics.length ? null : "Załaduj dzienne metryki sprzedaży dla wybranego zakresu dat.",
      },
      {
        name: "Dzienna historia kampanii",
        source: "SalesCampaignDailyMetric",
        status: campaignDailyRows.length ? "READY" : "EMPTY",
        records: campaignDailyRows.length,
        lastUpdatedAt: campaignDailyRows.length ? mostRecent(campaignDailyMetrics.map((row) => row.date instanceof Date ? row.date : new Date(row.date))) : null,
        coverage: campaignDailyRows.length ? "Datowane wiersze kampanii z CSV/API per provider, kampania, dzień i rynek." : "Brak datowanych wierszy kampanii.",
        blocker: campaignDailyRows.length ? null : "Zaimportuj CSV kampanii z kolumną Date, aby zachować historię dzienną per kampania.",
      },
      {
        name: "Google Ads",
        source: hasDirectImportCredentials ? "Google Ads API" : connectedGoogleAds.length ? "Composio OAuth bez odczytu metryk" : "Niepołączone",
        status: hasDirectImportCredentials ? "READY" : connectedGoogleAds.length ? "READ_BLOCKED" : "DISCONNECTED",
        records: connectedGoogleAds.length,
        lastUpdatedAt: mostRecent(googleAdsAccounts.map((account) => account.lastSyncAt ?? account.lastTestAt)),
        coverage: connectedGoogleAds.length ? "Połączone konta i status OAuth są prawdziwe; metryki kampanii są z tabeli kampanii/importu." : "Brak aktywnego konta Google Ads.",
        blocker: hasDirectImportCredentials ? null : connectedGoogleAds.length ? "Brakuje odblokowanego odczytu metryk przez Composio albo ręcznych poświadczeń Google Ads API." : "Połącz konto Google Ads.",
      },
      {
        name: "Google Analytics 4",
        source: connectedGoogleAnalytics.length ? "GA4 / Composio" : "Niepołączone",
        status: traffic.integrationStatus.status,
        records: (traffic.attribution?.length ?? 0) + (traffic.events?.length ?? 0),
        lastUpdatedAt: mostRecent(googleAnalyticsAccounts.map((account) => account.lastSyncAt ?? account.lastTestAt)),
        coverage: traffic.integrationStatus.status === "READY" ? "Sesje, atrybucja płatnego ruchu i zdarzenia GA4." : "Połączenie/konfiguracja widoczna, ale brak zsynchronizowanych metryk GA4 dla tego okresu.",
        blocker: traffic.integrationStatus.blockers?.[0] ? humanizeIntegrationMessage(traffic.integrationStatus.blockers[0]) : null,
      },
      {
        name: "Meta Ads",
        source: connectedMeta.length ? "Meta Ads API" : "Niepołączone",
        status: connectedMeta.length ? "READY" : "DISCONNECTED",
        records: connectedMeta.length,
        lastUpdatedAt: mostRecent(metaAccounts.map((account) => account.lastSyncAt ?? account.lastTestAt)),
        coverage: connectedMeta.length ? "Połączone konto Meta Ads." : "Widoczna kampania Meta pochodzi z lokalnej tabeli kampanii/importu.",
        blocker: connectedMeta.length ? null : "Połącz Meta Ads, aby pobierać metryki bezpośrednio z konta reklamowego.",
      },
      {
        name: "TikTok Ads",
        source: connectedTikTok.length ? "TikTok Ads API" : "Niepołączone",
        status: connectedTikTok.length ? "READY" : "DISCONNECTED",
        records: connectedTikTok.length,
        lastUpdatedAt: mostRecent(tiktokAccounts.map((account) => account.lastSyncAt ?? account.lastTestAt)),
        coverage: connectedTikTok.length ? "Połączone konto TikTok Ads." : "Widoczna kampania TikTok pochodzi z lokalnej tabeli kampanii/importu.",
        blocker: connectedTikTok.length ? null : "Połącz TikTok Ads, aby pobierać metryki bezpośrednio z konta reklamowego.",
      },
    ];
    const recentOperations = integrationLogs.slice(0, 8).map((log) => ({
      provider: log.provider,
      operation: log.operation,
      status: log.status,
      message: log.errorMessage ? humanizeIntegrationMessage(log.errorMessage) : null,
      details: operationDetails(log),
      createdAt: log.createdAt,
    }));
    const diagnostics = [
      ...googleAdsAccounts.map((account) => ({
        provider: "Google Ads",
        channelId: account.channelId,
        status: account.lastErrorMessage ? "ERROR" : account.status,
        accountName: account.externalAccountName,
        lastTestAt: account.lastTestAt,
        lastSyncAt: account.lastSyncAt,
        message: account.lastErrorMessage ? humanizeIntegrationMessage(account.lastErrorMessage) : (account.status === "CONNECTED" ? "OAuth aktywny" : "Brak aktywnego połączenia"),
      })),
      ...googleAnalyticsAccounts.map((account) => ({
        provider: "Google Analytics",
        channelId: account.channelId,
        status: account.lastErrorMessage ? "ERROR" : account.status,
        accountName: account.externalAccountName,
        lastTestAt: account.lastTestAt,
        lastSyncAt: account.lastSyncAt,
        message: account.lastErrorMessage
          ? humanizeIntegrationMessage(account.lastErrorMessage)
          : (account.status === "CONNECTED"
            ? humanizeIntegrationMessage(`Property ID: ${account.configs.find((config) => config.key === "propertyId")?.valueJson ?? "brak"}`)
            : "Brak aktywnego połączenia"),
      })),
      ...metaAccounts.map((account) => ({
        provider: "Meta Ads",
        channelId: account.channelId,
        status: account.lastErrorMessage ? "ERROR" : account.status,
        accountName: account.externalAccountName,
        lastTestAt: account.lastTestAt,
        lastSyncAt: account.lastSyncAt,
        message: account.lastErrorMessage ? humanizeIntegrationMessage(account.lastErrorMessage) : (account.status === "CONNECTED" ? "Połączone" : "Brak aktywnego połączenia"),
      })),
      ...(metaAccounts.length ? [] : [{
        provider: "Meta Ads",
        channelId: null,
        status: "DISCONNECTED",
        accountName: "Meta Ads",
        lastTestAt: null,
        lastSyncAt: null,
        message: "Brak aktywnego połączenia. Wpisz Ad Account ID i Access token albo zaimportuj eksport kampanii Meta CSV.",
      }]),
      ...tiktokAccounts.map((account) => ({
        provider: "TikTok Ads",
        channelId: account.channelId,
        status: account.lastErrorMessage ? "ERROR" : account.status,
        accountName: account.externalAccountName,
        lastTestAt: account.lastTestAt,
        lastSyncAt: account.lastSyncAt,
        message: account.lastErrorMessage ? humanizeIntegrationMessage(account.lastErrorMessage) : (account.status === "CONNECTED" ? "Połączone" : "Brak aktywnego połączenia"),
      })),
      ...(tiktokAccounts.length ? [] : [{
        provider: "TikTok Ads",
        channelId: null,
        status: "DISCONNECTED",
        accountName: "TikTok Ads",
        lastTestAt: null,
        lastSyncAt: null,
        message: "Brak aktywnego połączenia. Wpisz Advertiser ID i Access token albo zaimportuj eksport kampanii TikTok CSV.",
      }]),
    ];
    const googleAdsMissing = [
      ...new Set([
        ...googleAdsAccounts
          .map((account) => account.lastErrorMessage)
          .filter((message): message is string => Boolean(message)),
        ...(connectedGoogleAds.length === 0
          ? [
            "Aktywne połączenie Google Ads",
            "Customer ID",
            "Developer token",
            "OAuth Client ID",
            "OAuth Client Secret",
            "OAuth Refresh token",
          ]
          : hasDirectImportCredentials
            ? []
            : [
              "Import metryk z połączonego konta Composio: Proxy Execute jest wyłączone dla tej organizacji",
              "Alternatywnie ręczne poświadczenia Google Ads API: Customer ID, Developer token, OAuth Client ID, OAuth Client Secret, OAuth Refresh token",
            ]),
      ].map(humanizeIntegrationMessage)),
    ];
    const missingConfiguration = [
      ...googleAdsMissing.map((item) => ({ area: "Google Ads", item })),
      ...(traffic.integrationStatus.blockers ?? []).map((item: string) => ({ area: "Google Analytics 4", item: humanizeIntegrationMessage(item) })),
      ...(connectedGoogleAnalytics.length > 0 ? [] : [{ area: "Google Analytics 4", item: "Aktywne połączenie Google Analytics / GA4" }]),
      ...(connectedMeta.length > 0 ? [] : [{ area: "Meta Ads", item: "Połącz Meta Ads albo importuj eksport kampanii Meta CSV." }]),
      ...(connectedTikTok.length > 0 ? [] : [{ area: "TikTok Ads", item: "Połącz TikTok Ads albo importuj eksport kampanii TikTok CSV." }]),
      ...(cacheCampaignRows > 0 ? [{ area: "Kampanie", item: `${cacheCampaignRows} kampanii nadal pochodzi z seed/cache. Zastąp je importem CSV albo synchronizacją API.` }] : []),
      ...(campaignScope.filteredByDateAndChannel ? [] : [{ area: "Kampanie", item: "Brakuje datowanych wierszy kampanii, więc tabela kampanii nie jest jeszcze filtrowana po zakresie dat i rynku." }]),
      ...(dateCoverage.comparison.missingDays > 0 ? [{ area: "Porównanie", item: `Brakuje ${dateCoverage.comparison.missingDays}/${dateCoverage.comparison.expectedDays} dni poprzedniego okresu, dlatego zmiany procentowe są niedostępne.` }] : []),
      ...reconciliation.filter((item) => item.status === "DIFF").map((item) => ({ area: "Zgodność danych", item: `${item.label}: dzienne metryki różnią się od sumy kampanii o ${item.deltaPercent}%.` })),
    ];
    res.json({
      source: connectedGoogleAds.length > 0 ? "google-ads-or-local-cache" : "demo-seed",
      dataQuality: {
        googleAdsOAuthConnected: connectedGoogleAds.length,
        googleAdsImportReady: hasDirectImportCredentials,
        googleAnalyticsConnected: connectedGoogleAnalytics.length,
        googleAnalyticsImportReady,
        metaAdsConnected: connectedMeta.length,
        tiktokAdsConnected: connectedTikTok.length,
        campaignRows: campaigns.length,
        campaignDailyRows: campaignDailyRows.length,
        currentCoveragePct: dateCoverage.current.coveragePct,
        comparisonCoveragePct: dateCoverage.comparison.coveragePct,
        importedCampaignRows,
        cacheCampaignRows,
        trafficStatus: traffic.integrationStatus.status,
        realDataLevel: hasDirectImportCredentials || traffic.integrationStatus.status === "READY" ? "partial-real" : "connected-cache",
      },
      comparison: {
        from: parsedQuery.compareFrom,
        to: parsedQuery.compareTo,
        records: previousMetrics.length,
        available: previousMetrics.length > 0,
      },
      dateCoverage,
      googleAds: {
        connected: connectedGoogleAds.length > 0,
        importReady: hasDirectImportCredentials,
        accounts: googleAdsAccounts.map((account) => ({
          id: account.id,
          channelId: account.channelId,
          status: account.status,
          externalAccountName: account.externalAccountName,
          lastSyncAt: account.lastSyncAt,
          lastErrorMessage: account.lastErrorMessage,
        })),
        missing: googleAdsMissing,
      },
      totals: {
        spend: money(totalSpend),
        revenue: money(totalRevenue),
        impressions: totalImpressions,
        clicks: totalClicks,
        conversions: totalConversions,
        roas: totalSpend ? money(totalRevenue / totalSpend) : 0,
        ctr: totalImpressions ? money((totalClicks / totalImpressions) * 100) : 0,
        cpc: totalClicks ? money(totalSpend / totalClicks) : 0,
        cpa: totalConversions ? money(totalSpend / totalConversions) : 0,
      },
      dailyTotals,
      metricChanges,
      channelBreakdown,
      providerSummary: byProvider,
      campaignDaily,
      campaignDailyRows,
      reconciliation,
      campaignScope,
      campaignSourceSummary,
      nextImportActions,
      missingConfiguration,
      dataSources,
      recentOperations,
      diagnostics,
      traffic: {
        status: traffic.integrationStatus,
        paidAttribution: traffic.attribution.filter((row: any) => ["cpc", "paid", "paid_social", "ppc"].some((medium) => String(row.medium).toLowerCase().includes(medium))).slice(0, 12),
        events: traffic.events.slice(0, 12),
      },
      campaigns: enrichedCampaigns,
    });
  } catch (error) {
    next(error);
  }
});

salesRouter.post("/marketing/preview-import", async (req, res, next) => {
  try {
    const schema = z.object({
      type: z.enum(["campaigns", "traffic", "events", "daily"]),
      csv: z.string().min(1),
      provider: z.string().optional().default("Google"),
      channelId: z.string().optional().default("pl"),
      propertyId: z.string().optional().default("csv-import"),
      importDailyFromDatedRows: z.boolean().optional().default(true),
      replaceProvider: z.boolean().optional().default(false),
      from: z.string().optional().default("2026-05-22"),
      to: z.string().optional().default("2026-05-28"),
      compareFrom: z.string().optional().default("2026-05-15"),
      compareTo: z.string().optional().default("2026-05-21"),
      channels: z.string().optional().default("pl,uk"),
    });
    const body = schema.parse(req.body);
    const preview = body.type === "campaigns"
      ? previewCampaignCsv(body.csv, body.provider, body.channelId, body.importDailyFromDatedRows)
      : body.type === "traffic"
        ? previewTrafficCsv(body.csv, body.channelId, body.propertyId)
        : body.type === "events"
          ? previewTrafficEventsCsv(body.csv, body.channelId, body.propertyId)
          : previewDailyMarketingCsv(body.csv, body.channelId);
    if (body.type === "traffic") {
      const impact = await trafficPreviewImpact(body.csv, body.channelId, body.propertyId, {
        from: body.from,
        to: body.to,
        channels: body.channels,
      });
      res.json({
        ...preview,
        trafficImpact: {
          csvRows: impact.csvRows,
          newRows: impact.newRows,
          existingRows: impact.existingRows,
          currentPeriodDaysCovered: impact.currentPeriodDaysCovered,
          currentExpectedDays: impact.currentExpectedDays,
          propertyIds: impact.propertyIds,
          selectedChannels: impact.selectedChannels,
        },
        readinessHints: impact.readinessHints,
      });
      return;
    }
    if (body.type === "events") {
      const impact = await trafficEventsPreviewImpact(body.csv, body.channelId, body.propertyId, {
        from: body.from,
        to: body.to,
        channels: body.channels,
      });
      res.json({
        ...preview,
        trafficImpact: {
          csvRows: impact.csvRows,
          newRows: impact.newRows,
          existingRows: impact.existingRows,
          currentPeriodDaysCovered: impact.currentPeriodDaysCovered,
          currentExpectedDays: impact.currentExpectedDays,
          propertyIds: impact.propertyIds,
          selectedChannels: impact.selectedChannels,
        },
        readinessHints: impact.readinessHints,
      });
      return;
    }
    if (body.type === "daily") {
      const impact = await dailyMarketingPreviewImpact(body.csv, body.channelId, {
        from: body.from,
        to: body.to,
        compareFrom: body.compareFrom,
        compareTo: body.compareTo,
        channels: body.channels,
      });
      res.json({
        ...preview,
        dailyImpact: {
          csvRows: impact.csvRows,
          newRows: impact.newRows,
          existingRows: impact.existingRows,
          currentPeriodDaysCovered: impact.currentPeriodDaysCovered,
          currentExpectedDays: impact.currentExpectedDays,
          comparisonPeriodDaysCovered: impact.comparisonPeriodDaysCovered,
          comparisonExpectedDays: impact.comparisonExpectedDays,
          selectedChannels: impact.selectedChannels,
        },
        readinessHints: impact.readinessHints,
      });
      return;
    }
    if (body.type !== "campaigns") {
      res.json(preview);
      return;
    }
    const campaignPreview = preview as ReturnType<typeof previewCampaignCsv>;
    const providers = campaignPreview.providers ?? [];
    const existingCampaigns = providers.length
      ? await prisma.salesCampaign.findMany({
        where: { provider: { in: providers } },
        select: { id: true, provider: true, name: true, spend: true, revenue: true },
      })
      : [];
    const importedKeys = new Set(campaignPreview.campaigns.map((campaign) => campaignMatchKey(campaign.provider, campaign.name)));
    const matchingExisting = existingCampaigns.filter((campaign) => importedKeys.has(campaignMatchKey(campaign.provider, campaign.name)));
    const matchingCache = matchingExisting.filter((campaign) => !campaign.id.startsWith("import-"));
    const matchingImported = matchingExisting.filter((campaign) => campaign.id.startsWith("import-"));
    const replaceProviderRows = body.replaceProvider ? existingCampaigns.length : 0;
    res.json({
      ...campaignPreview,
      existingMatches: matchingExisting.map((campaign) => ({
        id: campaign.id,
        provider: campaign.provider,
        name: campaign.name,
        dataSource: campaign.id.startsWith("import-") ? "CSV/import" : "seed/cache",
      })),
      replacementImpact: {
        replaceProvider: body.replaceProvider,
        providerRows: existingCampaigns.length,
        rowsDeletedBeforeImport: replaceProviderRows,
        matchingExistingRows: matchingExisting.length,
        matchingCacheRows: matchingCache.length,
        matchingImportedRows: matchingImported.length,
        cacheRowsMatched: matchingCache.length,
        cacheRowsDeletedByMatch: body.replaceProvider ? 0 : matchingCache.length,
        cacheRowsDeletedByReplace: body.replaceProvider
          ? existingCampaigns.filter((campaign) => !campaign.id.startsWith("import-")).length
          : 0,
      },
      readinessHints: [
        campaignPreview.hasDateColumn && campaignPreview.campaignDailyRows > 0
          ? "CSV utworzy dzienną historię kampanii."
          : "CSV nie utworzy dziennej historii kampanii bez kolumny Date.",
        campaignPreview.channels.length > 1
          ? `CSV rozdziela rynki: ${campaignPreview.channels.join(", ")}.`
          : `CSV trafi do rynku ${campaignPreview.channels[0] ?? body.channelId}.`,
        body.replaceProvider
          ? `Włączone zastąpienie providera usunie ${replaceProviderRows} istniejących kampanii przed importem.`
          : matchingCache.length
            ? `Import automatycznie usunie ${matchingCache.length} seed/cache z tym samym providerem i nazwą.`
            : "Bez zastąpienia providera pozostałe seed/cache innych nazw zostaną bez zmian.",
      ],
    });
  } catch (error) {
    next(error);
  }
});

salesRouter.post("/marketing/import-campaigns", async (req, res, next) => {
  try {
    const schema = z.object({
      csv: z.string().min(1),
      provider: z.string().optional().default("Google"),
      channelId: z.string().optional().default("pl"),
      replaceProvider: z.boolean().optional().default(false),
      importDailyFromDatedRows: z.boolean().optional().default(true),
    });
    const body = schema.parse(req.body);
    const parsedRows = parseCampaignCsv(body.csv, body.provider);
    if (!parsedRows.length) {
      res.status(400).json({ error: "Nie rozpoznano żadnych wierszy kampanii z wartościami liczbowymi." });
      return;
    }
    const qualityWarnings = previewCampaignCsv(body.csv, body.provider, body.channelId, body.importDailyFromDatedRows).qualityWarnings;
    const rows = aggregateCampaignRows(parsedRows);
    const dailyRows = body.importDailyFromDatedRows ? aggregateCampaignRowsByDay(parsedRows, body.channelId.toLowerCase()) : [];
    const campaignDailyRows = body.importDailyFromDatedRows ? aggregateCampaignRowsByCampaignDay(parsedRows, body.channelId.toLowerCase()) : [];
    const channelIds = Array.from(new Set(dailyRows.map((row) => row.channelId)));
    if (channelIds.length) {
      const existingChannels = await prisma.salesChannel.findMany({ where: { id: { in: channelIds } }, select: { id: true } });
      const knownChannelIds = new Set(existingChannels.map((channel) => channel.id));
      const missingChannels = channelIds.filter((channelId) => !knownChannelIds.has(channelId));
      if (missingChannels.length) {
        res.status(400).json({ error: `Nieznany kanał w CSV: ${missingChannels.join(", ")}` });
        return;
      }
    }
    let replacedCampaignDailyRows = 0;
    let replacedMatchedCacheRows = 0;
    const providers = Array.from(new Set(rows.map((row) => row.provider)));
    if (body.replaceProvider) {
      await prisma.salesCampaign.deleteMany({ where: { provider: { in: providers } } });
      replacedCampaignDailyRows = await deleteCampaignDailyMetricsByProviders(providers);
    } else {
      const existingProviderCampaigns = await prisma.salesCampaign.findMany({
        where: { provider: { in: providers } },
        select: { id: true, provider: true, name: true },
      });
      const importedKeys = new Set(rows.map((row) => campaignMatchKey(row.provider, row.name)));
      const matchedCacheIds = existingProviderCampaigns
        .filter((campaign) => !campaign.id.startsWith("import-"))
        .filter((campaign) => importedKeys.has(campaignMatchKey(campaign.provider, campaign.name)))
        .map((campaign) => campaign.id);
      if (matchedCacheIds.length) {
        replacedCampaignDailyRows = await deleteCampaignDailyMetricsByCampaignIds(matchedCacheIds);
        const result = await prisma.salesCampaign.deleteMany({ where: { id: { in: matchedCacheIds } } });
        replacedMatchedCacheRows = result.count;
      }
    }
    for (const row of rows) {
      await prisma.salesCampaign.upsert({
        where: { id: row.id },
        create: row,
        update: {
          provider: row.provider,
          name: row.name,
          spend: row.spend,
          revenue: row.revenue,
          impressions: row.impressions,
          clicks: row.clicks,
          conversions: row.conversions,
        },
      });
    }
    for (const row of dailyRows) {
      const existing = await prisma.salesDailyMetric.findUnique({ where: { channelId_date: { channelId: row.channelId, date: row.date } } });
      await prisma.salesDailyMetric.upsert({
        where: { channelId_date: { channelId: row.channelId, date: row.date } },
        create: {
          channelId: row.channelId,
          date: row.date,
          revenueNet: row.revenueNet,
          totalCost: row.mediaCost,
          productCost: 0,
          mediaCost: row.mediaCost,
          additionalCost: 0,
          marketplaceCost: 0,
          discounts: 0,
          orders: row.adConversions,
          unitsSold: 0,
          newCustomers: 0,
          returningCustomers: 0,
          sessions: row.clicks,
          productViews: 0,
          addToCart: 0,
          checkoutStarted: 0,
          transactions: row.adConversions,
          impressions: row.impressions,
          clicks: row.clicks,
          adConversions: row.adConversions,
        },
        update: {
          revenueNet: row.revenueNet,
          mediaCost: row.mediaCost,
          totalCost: existing ? existing.totalCost - existing.mediaCost + row.mediaCost : row.mediaCost,
          sessions: row.clicks,
          transactions: row.adConversions,
          orders: row.adConversions,
          impressions: row.impressions,
          clicks: row.clicks,
          adConversions: row.adConversions,
        },
      });
    }
    for (const row of campaignDailyRows) {
      await upsertCampaignDailyMetric(row);
    }
    await prisma.integrationLog.create({
      data: {
        organizationId: "org-demo-sales",
        provider: "marketing-csv",
        operation: "marketing.import_campaigns",
        status: "SUCCESS",
        requestPayloadJson: JSON.stringify({ provider: body.provider, channelId: body.channelId, replaceProvider: body.replaceProvider, rows: parsedRows.length }),
        responsePayloadJson: JSON.stringify({ imported: rows.length, sourceRows: parsedRows.length, dailyRows: dailyRows.length, campaignDailyRows: campaignDailyRows.length, replacedCampaignDailyRows, replacedMatchedCacheRows, providers, channels: channelIds, qualityWarnings }),
      },
    });
    res.json({
      imported: rows.length,
      sourceRows: parsedRows.length,
      dailyRows: dailyRows.length,
      campaignDailyRows: campaignDailyRows.length,
      replacedCampaignDailyRows,
      replacedMatchedCacheRows,
      qualityWarnings,
      campaigns: rows,
      summary: {
        providers,
        channels: channelIds,
        sourceRows: parsedRows.length,
        dailyRows: dailyRows.length,
        campaignDailyRows: campaignDailyRows.length,
        replacedCampaignDailyRows,
        replacedMatchedCacheRows,
        spend: money(sum(rows, (row) => row.spend)),
        revenue: money(sum(rows, (row) => row.revenue)),
        impressions: sum(rows, (row) => row.impressions),
        clicks: sum(rows, (row) => row.clicks),
        conversions: sum(rows, (row) => row.conversions),
      },
    });
  } catch (error) {
    next(error);
  }
});

salesRouter.post("/marketing/import-traffic", async (req, res, next) => {
  try {
    const schema = z.object({
      csv: z.string().min(1),
      channelId: z.string().optional().default("pl"),
      propertyId: z.string().optional().default("csv-import"),
      replaceProperty: z.boolean().optional().default(false),
      from: z.string().optional().default("2026-05-22"),
      to: z.string().optional().default("2026-05-28"),
      channels: z.string().optional().default("pl,uk"),
    });
    const body = schema.parse(req.body);
    const rows = parseTrafficCsv(body.csv, body.channelId.toLowerCase(), body.propertyId);
    if (!rows.length) {
      res.status(400).json({ error: "Nie rozpoznano żadnych wierszy GA4 z wartościami liczbowymi." });
      return;
    }
    const qualityWarnings = previewTrafficCsv(body.csv, body.channelId, body.propertyId).qualityWarnings;
    const impact = await trafficPreviewImpact(body.csv, body.channelId, body.propertyId, {
      from: body.from,
      to: body.to,
      channels: body.channels,
    });
    const propertyIds = Array.from(new Set(rows.map((row) => row.propertyId)));
    if (body.replaceProperty) {
      await prisma.trafficAttributionMetric.deleteMany({ where: { organizationId: "org-demo-sales", propertyId: { in: propertyIds } } });
      await prisma.trafficDailyMetric.deleteMany({ where: { organizationId: "org-demo-sales", propertyId: { in: propertyIds } } });
    }
    const daily = new Map<string, { channelId: string; propertyId: string; date: Date; sessions: number; views: number; transactions: number; purchaseRevenue: number }>();
    for (const row of rows) {
      await prisma.trafficAttributionMetric.upsert({
        where: {
          organizationId_channelId_propertyId_date_source_medium_campaign: {
            organizationId: "org-demo-sales",
            channelId: row.channelId,
            propertyId: row.propertyId,
            date: row.date,
            source: row.source,
            medium: row.medium,
            campaign: row.campaign,
          },
        },
        create: { organizationId: "org-demo-sales", ...row },
        update: {
          sessions: row.sessions,
          views: row.views,
          transactions: row.transactions,
          purchaseRevenue: row.purchaseRevenue,
        },
      });
      const key = `${row.channelId}|${row.propertyId}|${row.date.toISOString()}`;
      const current = daily.get(key) ?? { channelId: row.channelId, propertyId: row.propertyId, date: row.date, sessions: 0, views: 0, transactions: 0, purchaseRevenue: 0 };
      current.sessions += row.sessions;
      current.views += row.views;
      current.transactions += row.transactions;
      current.purchaseRevenue += row.purchaseRevenue;
      daily.set(key, current);
    }
    for (const row of daily.values()) {
      await prisma.trafficDailyMetric.upsert({
        where: {
          organizationId_channelId_propertyId_date: {
            organizationId: "org-demo-sales",
            channelId: row.channelId,
            propertyId: row.propertyId,
            date: row.date,
          },
        },
        create: {
          organizationId: "org-demo-sales",
          channelId: row.channelId,
          propertyId: row.propertyId,
          date: row.date,
          totalUsers: row.sessions,
          activeUsers: row.sessions,
          sessions: row.sessions,
          engagedSessions: row.sessions,
          views: row.views,
          transactions: row.transactions,
          purchaseRevenue: row.purchaseRevenue,
        },
        update: {
          totalUsers: row.sessions,
          activeUsers: row.sessions,
          sessions: row.sessions,
          engagedSessions: row.sessions,
          views: row.views,
          transactions: row.transactions,
          purchaseRevenue: row.purchaseRevenue,
        },
      });
    }
    await prisma.integrationLog.create({
      data: {
        organizationId: "org-demo-sales",
        provider: "ga4-csv",
        operation: "marketing.import_traffic",
        status: "SUCCESS",
        requestPayloadJson: JSON.stringify({ channelId: body.channelId, propertyId: body.propertyId, replaceProperty: body.replaceProperty, rows: rows.length }),
        responsePayloadJson: JSON.stringify({ imported: rows.length, dailyRows: daily.size, propertyIds, trafficImpact: impact, qualityWarnings }),
      },
    });
    res.json({
      imported: rows.length,
      dailyRows: daily.size,
      propertyIds,
      qualityWarnings,
      trafficImpact: {
        csvRows: impact.csvRows,
        newRows: impact.newRows,
        existingRows: impact.existingRows,
        currentPeriodDaysCovered: impact.currentPeriodDaysCovered,
        currentExpectedDays: impact.currentExpectedDays,
        propertyIds: impact.propertyIds,
        selectedChannels: impact.selectedChannels,
      },
      summary: {
        range: dateRangeLabel(rows.map((row) => row.date)),
        channels: Array.from(new Set(rows.map((row) => row.channelId))),
        sessions: sum(rows, (row) => row.sessions),
        views: sum(rows, (row) => row.views),
        transactions: sum(rows, (row) => row.transactions),
        purchaseRevenue: money(sum(rows, (row) => row.purchaseRevenue)),
      },
    });
  } catch (error) {
    next(error);
  }
});

salesRouter.post("/marketing/import-events", async (req, res, next) => {
  try {
    const schema = z.object({
      csv: z.string().min(1),
      channelId: z.string().optional().default("pl"),
      propertyId: z.string().optional().default("csv-import"),
      replaceProperty: z.boolean().optional().default(false),
      from: z.string().optional().default("2026-05-22"),
      to: z.string().optional().default("2026-05-28"),
      channels: z.string().optional().default("pl,uk"),
    });
    const body = schema.parse(req.body);
    const rows = parseTrafficEventsCsv(body.csv, body.channelId.toLowerCase(), body.propertyId);
    if (!rows.length) {
      res.status(400).json({ error: "Nie rozpoznano żadnych zdarzeń GA4 z wartościami liczbowymi." });
      return;
    }
    const qualityWarnings = previewTrafficEventsCsv(body.csv, body.channelId, body.propertyId).qualityWarnings;
    const impact = await trafficEventsPreviewImpact(body.csv, body.channelId, body.propertyId, {
      from: body.from,
      to: body.to,
      channels: body.channels,
    });
    const propertyIds = Array.from(new Set(rows.map((row) => row.propertyId)));
    if (body.replaceProperty) {
      await prisma.trafficEventMetric.deleteMany({ where: { organizationId: "org-demo-sales", propertyId: { in: propertyIds } } });
    }
    const daily = new Map<string, { channelId: string; propertyId: string; date: Date; totalUsers: number }>();
    for (const row of rows) {
      await prisma.trafficEventMetric.upsert({
        where: {
          organizationId_channelId_propertyId_date_eventName: {
            organizationId: "org-demo-sales",
            channelId: row.channelId,
            propertyId: row.propertyId,
            date: row.date,
            eventName: row.eventName,
          },
        },
        create: { organizationId: "org-demo-sales", ...row },
        update: {
          eventCount: row.eventCount,
          totalUsers: row.totalUsers,
        },
      });
      const key = `${row.channelId}|${row.propertyId}|${row.date.toISOString()}`;
      const current = daily.get(key) ?? { channelId: row.channelId, propertyId: row.propertyId, date: row.date, totalUsers: 0 };
      current.totalUsers += row.totalUsers;
      daily.set(key, current);
    }
    for (const row of daily.values()) {
      const existing = await prisma.trafficDailyMetric.findUnique({
        where: { organizationId_channelId_propertyId_date: { organizationId: "org-demo-sales", channelId: row.channelId, propertyId: row.propertyId, date: row.date } },
      });
      await prisma.trafficDailyMetric.upsert({
        where: { organizationId_channelId_propertyId_date: { organizationId: "org-demo-sales", channelId: row.channelId, propertyId: row.propertyId, date: row.date } },
        create: {
          organizationId: "org-demo-sales",
          channelId: row.channelId,
          propertyId: row.propertyId,
          date: row.date,
          totalUsers: row.totalUsers,
          activeUsers: row.totalUsers,
        },
        update: {
          totalUsers: existing?.totalUsers || row.totalUsers,
          activeUsers: existing?.activeUsers || row.totalUsers,
        },
      });
    }
    await prisma.integrationLog.create({
      data: {
        organizationId: "org-demo-sales",
        provider: "ga4-events-csv",
        operation: "marketing.import_events",
        status: "SUCCESS",
        requestPayloadJson: JSON.stringify({ channelId: body.channelId, propertyId: body.propertyId, replaceProperty: body.replaceProperty, rows: rows.length }),
        responsePayloadJson: JSON.stringify({ imported: rows.length, dailyRows: daily.size, propertyIds, events: Array.from(new Set(rows.map((row) => row.eventName))), trafficImpact: impact, qualityWarnings }),
      },
    });
    res.json({
      imported: rows.length,
      dailyRows: daily.size,
      propertyIds,
      qualityWarnings,
      trafficImpact: {
        csvRows: impact.csvRows,
        newRows: impact.newRows,
        existingRows: impact.existingRows,
        currentPeriodDaysCovered: impact.currentPeriodDaysCovered,
        currentExpectedDays: impact.currentExpectedDays,
        propertyIds: impact.propertyIds,
        selectedChannels: impact.selectedChannels,
      },
      summary: {
        range: dateRangeLabel(rows.map((row) => row.date)),
        channels: Array.from(new Set(rows.map((row) => row.channelId))),
        events: Array.from(new Set(rows.map((row) => row.eventName))),
        eventCount: sum(rows, (row) => row.eventCount),
        totalUsers: sum(rows, (row) => row.totalUsers),
      },
    });
  } catch (error) {
    next(error);
  }
});

salesRouter.post("/marketing/import-daily-metrics", async (req, res, next) => {
  try {
    const schema = z.object({
      csv: z.string().min(1),
      channelId: z.string().optional().default("pl"),
      from: z.string().optional().default("2026-05-22"),
      to: z.string().optional().default("2026-05-28"),
      compareFrom: z.string().optional().default("2026-05-15"),
      compareTo: z.string().optional().default("2026-05-21"),
      channels: z.string().optional().default("pl,uk"),
    });
    const body = schema.parse(req.body);
    const rows = parseDailyMarketingCsv(body.csv, body.channelId.toLowerCase());
    if (!rows.length) {
      res.status(400).json({ error: "Nie rozpoznano żadnych dziennych metryk marketingowych z wartościami liczbowymi." });
      return;
    }
    const qualityWarnings = previewDailyMarketingCsv(body.csv, body.channelId).qualityWarnings;
    const channelIds = Array.from(new Set(rows.map((row) => row.channelId)));
    const existingChannels = await prisma.salesChannel.findMany({ where: { id: { in: channelIds } }, select: { id: true } });
    const knownChannelIds = new Set(existingChannels.map((channel) => channel.id));
    const missingChannels = channelIds.filter((channelId) => !knownChannelIds.has(channelId));
    if (missingChannels.length) {
      res.status(400).json({ error: `Nieznany kanał w CSV: ${missingChannels.join(", ")}` });
      return;
    }
    const impact = await dailyMarketingPreviewImpact(body.csv, body.channelId, {
      from: body.from,
      to: body.to,
      compareFrom: body.compareFrom,
      compareTo: body.compareTo,
      channels: body.channels,
    });
    for (const row of rows) {
      const existing = await prisma.salesDailyMetric.findUnique({ where: { channelId_date: { channelId: row.channelId, date: row.date } } });
      await prisma.salesDailyMetric.upsert({
        where: { channelId_date: { channelId: row.channelId, date: row.date } },
        create: {
          channelId: row.channelId,
          date: row.date,
          revenueNet: row.revenueNet,
          totalCost: row.mediaCost,
          productCost: 0,
          mediaCost: row.mediaCost,
          additionalCost: 0,
          marketplaceCost: 0,
          discounts: 0,
          orders: row.adConversions,
          unitsSold: 0,
          newCustomers: 0,
          returningCustomers: 0,
          sessions: row.clicks,
          productViews: 0,
          addToCart: 0,
          checkoutStarted: 0,
          transactions: row.adConversions,
          impressions: row.impressions,
          clicks: row.clicks,
          adConversions: row.adConversions,
        },
        update: {
          revenueNet: row.hasRevenueNet ? row.revenueNet : existing?.revenueNet || 0,
          mediaCost: row.hasMediaCost ? row.mediaCost : existing?.mediaCost || 0,
          impressions: row.hasImpressions ? row.impressions : existing?.impressions || 0,
          clicks: row.hasClicks ? row.clicks : existing?.clicks || 0,
          adConversions: row.hasAdConversions ? row.adConversions : existing?.adConversions || 0,
        },
      });
    }
    await prisma.integrationLog.create({
      data: {
        organizationId: "org-demo-sales",
        provider: "marketing-daily-csv",
        operation: "marketing.import_daily_metrics",
        status: "SUCCESS",
        requestPayloadJson: JSON.stringify({ channelId: body.channelId, rows: rows.length }),
        responsePayloadJson: JSON.stringify({ imported: rows.length, channels: channelIds, dailyImpact: impact, qualityWarnings }),
      },
    });
    res.json({
      imported: rows.length,
      channels: channelIds,
      qualityWarnings,
      dailyImpact: {
        csvRows: impact.csvRows,
        newRows: impact.newRows,
        existingRows: impact.existingRows,
        currentPeriodDaysCovered: impact.currentPeriodDaysCovered,
        currentExpectedDays: impact.currentExpectedDays,
        comparisonPeriodDaysCovered: impact.comparisonPeriodDaysCovered,
        comparisonExpectedDays: impact.comparisonExpectedDays,
        selectedChannels: impact.selectedChannels,
      },
      summary: {
        range: dateRangeLabel(rows.map((row) => row.date)),
        spend: money(sum(rows, (row) => row.mediaCost)),
        revenue: money(sum(rows, (row) => row.revenueNet)),
        impressions: sum(rows, (row) => row.impressions),
        clicks: sum(rows, (row) => row.clicks),
        conversions: sum(rows, (row) => row.adConversions),
      },
    });
  } catch (error) {
    next(error);
  }
});

salesRouter.get("/traffic", async (req, res, next) => {
  try {
    res.json(await buildTrafficResponse(req.query));
  } catch (error) {
    next(error);
  }
});

salesRouter.get("/integrations", async (_req, res) => {
  res.json({
    availableSlots: 0,
    channels: [
      { id: "pl", name: "PL", status: "CONNECTED", providers: ["Shop", "Google Analytics", "Google Ads", "Meta Ads"] },
      { id: "uk", name: "UK", status: "CONNECTED", providers: ["Shop", "Google Analytics"] },
    ],
    providers: [
      { id: "shop", name: "Sklep", status: "CONNECTED" },
      { id: "google-analytics", name: "Google Analytics", status: "CONNECTED" },
      { id: "google-ads", name: "Google Ads", status: "CONNECTED" },
      { id: "meta-ads", name: "Meta Ads", status: "CONNECTED" },
      { id: "tiktok-ads", name: "TikTok Ads", status: "MISSING" },
    ],
  });
});

salesRouter.post("/ai/query", async (req, res, next) => {
  try {
    const schema = z.object({
      message: z.string().min(1),
      context: z.string().optional().default("summary"),
    });
    const body = schema.parse(req.body);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error: "GEMINI_API_KEY is not configured",
        answer: "Panel AI jest podłączony do backendu, ale brakuje GEMINI_API_KEY w .env.local.",
      });
      return;
    }

    const metrics = await getMetrics({});
    const summary = buildSummary(metrics);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });
    const prompt = [
      "Jesteś analitykiem e-commerce w module Sprzedaż.",
      "Odpowiadaj po polsku, konkretnie, na podstawie danych.",
      `Aktualny kontekst: ${body.context}`,
      `Dane KPI JSON: ${JSON.stringify(summary.kpis)}`,
      `Pytanie użytkownika: ${body.message}`,
    ].join("\n");

    const result = await model.generateContent(prompt);
    const answer = result.response.text();
    const conversation = await prisma.aiConversation.create({
      data: {
        title: body.message.slice(0, 80),
        messages: {
          create: [
            { role: "user", content: body.message },
            { role: "assistant", content: answer },
          ],
        },
      },
      include: { messages: true },
    });
    res.json({ answer, conversationId: conversation.id });
  } catch (error) {
    next(error);
  }
});
