import { createSign } from "node:crypto";
import type { IntegrationAccount } from "@prisma/client";
import { prisma } from "./db.js";

const ORGANIZATION_ID = "org-demo-sales";
const COMPOSIO_PROXY_BASE = "https://backend.composio.dev/api/v3.1";

type TrafficQuery = {
  from?: string;
  to?: string;
  compareFrom?: string;
  compareTo?: string;
  channels?: string;
};

type GaRunReport = {
  dimensions?: Array<{ name: string }>;
  metrics?: Array<{ name: string }>;
  dateRanges?: Array<{ startDate: string; endDate: string }>;
  dimensionFilter?: unknown;
  orderBys?: unknown[];
  limit?: number;
};

type GaRow = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

function json(value: unknown) {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function gaDate(value: string) {
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return value;
}

function numberValue(row: GaRow, index: number) {
  return Number(row.metricValues?.[index]?.value ?? 0) || 0;
}

function textValue(row: GaRow, index: number, fallback = "(not set)") {
  return String(row.dimensionValues?.[index]?.value || fallback);
}

function money(value: number) {
  return Number(value.toFixed(2));
}

function pct(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function ratio(part: number, total: number) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

type AccountWithConfig = IntegrationAccount & {
  configs?: Array<{ key: string; valueJson: string }>;
  secrets?: Array<{ key: string; secretRef: string | null }>;
};

function connectionValue(account: AccountWithConfig, key: string) {
  const config = account.configs?.find((item) => item.key === key);
  const secret = account.secrets?.find((item) => item.key === key);
  const value = String(secret?.secretRef || parseJson<string | null>(config?.valueJson, null) || "").trim();
  if (value) return value;
  if (key === "clientId") return process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || "";
  if (key === "clientSecret") return process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "";
  return "";
}

function propertyIdFromAccount(account: AccountWithConfig) {
  const config = account.configs?.find((item) => item.key === "propertyId");
  const value = parseJson<string | null>(config?.valueJson, null);
  const propertyId = String(value || "").replace(/^properties\//, "").trim();
  if (!propertyId || propertyId === "demo-property") return "";
  return propertyId;
}

export type GaPropertyCandidate = {
  account: string;
  accountDisplayName: string;
  property: string;
  propertyId: string;
  propertyDisplayName: string;
};

export async function discoverGoogleAnalyticsProperties(account: IntegrationAccount) {
  const fullAccount = await prisma.integrationAccount.findUnique({ where: { id: account.id }, include: { configs: true, secrets: true } });
  if (!fullAccount) throw new Error("Nie znaleziono konta Google Analytics.");
  const accessToken = await getServiceAccountAccessToken(fullAccount) || await getGoogleOAuthAccessToken(fullAccount);
  let data: any = null;
  if (accessToken) {
    const response = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    data = await response.json().catch(() => ({})) as any;
    if (!response.ok) {
      throw new Error(`GA4 property discovery failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
    }
  } else if (fullAccount.externalAccountId) {
    const apiKey = process.env.COMPOSIO_API_KEY?.trim();
    if (!apiKey) throw new Error("Brak COMPOSIO_API_KEY dla wykrywania GA4 Property ID.");
    const response = await fetch(`${COMPOSIO_PROXY_BASE}/tools/execute/proxy`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: json({
        connected_account_id: fullAccount.externalAccountId,
        method: "GET",
        endpoint: "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
      }),
    });
    data = await response.json().catch(() => ({})) as any;
    if (!response.ok) {
      if (JSON.stringify(data).includes("Proxy execute is not enabled")) {
        throw new Error("Composio Proxy Execute jest wyłączone dla tej organizacji, więc nie można automatycznie wykryć GA4 Property ID z połączenia Composio.");
      }
      throw new Error(`GA4 Composio property discovery failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
    }
    data = data?.data ?? data?.response_data ?? data;
  } else {
    throw new Error("Połącz Google Analytics przez Google OAuth albo wpisz Service Account client_email i private_key.");
  }
  const summaries = Array.isArray(data?.accountSummaries) ? data.accountSummaries : [];
  const properties: GaPropertyCandidate[] = [];
  for (const summary of summaries) {
    for (const property of Array.isArray(summary?.propertySummaries) ? summary.propertySummaries : []) {
      const propertyName = String(property?.property || "");
      const propertyId = propertyName.replace(/^properties\//, "").trim();
      if (!propertyId) continue;
      properties.push({
        account: String(summary?.account || ""),
        accountDisplayName: String(summary?.displayName || ""),
        property: propertyName,
        propertyId,
        propertyDisplayName: String(property?.displayName || propertyId),
      });
    }
  }
  return properties;
}

export async function ensureGoogleAnalyticsPropertyId(account: IntegrationAccount) {
  const fullAccount = await prisma.integrationAccount.findUnique({ where: { id: account.id }, include: { configs: true, secrets: true } });
  if (!fullAccount) throw new Error("Nie znaleziono konta Google Analytics.");
  const currentPropertyId = propertyIdFromAccount(fullAccount);
  if (currentPropertyId) return { propertyId: currentPropertyId, discovered: false, candidates: [] as GaPropertyCandidate[] };
  const candidates = await discoverGoogleAnalyticsProperties(fullAccount);
  if (candidates.length !== 1) {
    const names = candidates.slice(0, 8).map((item) => `${item.propertyId} (${item.propertyDisplayName})`).join(", ");
    throw new Error(candidates.length
      ? `Znaleziono kilka właściwości GA4. Wpisz Property ID ręcznie: ${names}`
      : "Nie znaleziono żadnej właściwości GA4 dla tego konta Google.");
  }
  const candidate = candidates[0];
  await prisma.integrationConfig.upsert({
    where: { organizationId_provider_configType_key: { organizationId: ORGANIZATION_ID, provider: "google-analytics", configType: "connection", key: "propertyId" } },
    update: {
      integrationAccountId: account.id,
      valueJson: json(candidate.propertyId),
      rawPayloadJson: json({ discoveredFrom: "analyticsadmin.accountSummaries", candidate }),
    },
    create: {
      organizationId: ORGANIZATION_ID,
      integrationAccountId: account.id,
      provider: "google-analytics",
      configType: "connection",
      key: "propertyId",
      valueJson: json(candidate.propertyId),
      rawPayloadJson: json({ discoveredFrom: "analyticsadmin.accountSummaries", candidate }),
    },
  });
  await prisma.integrationLog.create({
    data: {
      organizationId: ORGANIZATION_ID,
      provider: "google-analytics",
      operation: "integration.ga4.discover_property",
      status: "SUCCESS",
      requestPayloadJson: json({ channelId: account.channelId }),
      responsePayloadJson: json({ propertyId: candidate.propertyId, propertyDisplayName: candidate.propertyDisplayName }),
    },
  });
  return { propertyId: candidate.propertyId, discovered: true, candidates };
}

async function getGaAccounts(channelIds?: string[]) {
  return prisma.integrationAccount.findMany({
    where: {
      organizationId: ORGANIZATION_ID,
      provider: "google-analytics",
      status: "CONNECTED",
      ...(channelIds?.length ? { channelId: { in: channelIds } } : {}),
    },
    include: { configs: true, secrets: true },
    orderBy: [{ channelId: "asc" }, { updatedAt: "desc" }],
  });
}

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getServiceAccountAccessToken(account: AccountWithConfig) {
  const clientEmail = connectionValue(account, "serviceAccountClientEmail");
  const privateKey = connectionValue(account, "serviceAccountPrivateKey").replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return "";
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey);
  const assertion = `${unsigned}.${base64url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok || !data?.access_token) {
    throw new Error(`GA4 service account token failed: ${response.status} ${data?.error_description || data?.error || "unknown error"}`);
  }
  return String(data.access_token);
}

async function runDirectGaReport(account: AccountWithConfig, propertyId: string, body: GaRunReport) {
  const accessToken = await getServiceAccountAccessToken(account) || await getGoogleOAuthAccessToken(account);
  if (!accessToken) return null;
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { "authorization": `Bearer ${accessToken}`, "content-type": "application/json" },
    body: json(body),
  });
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    throw new Error(`GA4 direct runReport failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

async function getGoogleOAuthAccessToken(account: AccountWithConfig) {
  const clientId = connectionValue(account, "clientId");
  const clientSecret = connectionValue(account, "clientSecret");
  const refreshToken = connectionValue(account, "refreshToken");
  if (!clientId || !clientSecret || !refreshToken) return "";
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok || !data?.access_token) {
    throw new Error(`GA4 OAuth token failed: ${response.status} ${data?.error_description || data?.error || "unknown error"}`);
  }
  return String(data.access_token);
}

async function runComposioGaReport(account: IntegrationAccount, propertyId: string, body: GaRunReport) {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new Error("Brak COMPOSIO_API_KEY dla synchronizacji Google Analytics.");
  if (!account.externalAccountId) throw new Error("Google Analytics jest bez identyfikatora konta Composio. Połącz konto ponownie przez Composio.");

  const response = await fetch(`${COMPOSIO_PROXY_BASE}/tools/execute/proxy`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: json({
      connected_account_id: account.externalAccountId,
      method: "POST",
      endpoint: `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      body,
    }),
  });
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    throw new Error(`GA4 Composio proxy failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data?.data ?? data?.response_data ?? data;
}

async function runGaReport(account: AccountWithConfig, propertyId: string, body: GaRunReport) {
  const direct = await runDirectGaReport(account, propertyId, body);
  if (direct) return direct;
  if (account.externalAccountType === "composio" || account.externalAccountId) {
    return runComposioGaReport(account, propertyId, body);
  }
  throw new Error("Połącz Google Analytics przez Google OAuth albo wpisz Service Account client_email i private_key w konfiguracji.");
}

function baseReport(from: string, to: string): Pick<GaRunReport, "dateRanges"> {
  return { dateRanges: [{ startDate: from, endDate: to }] };
}

async function syncAccount(account: AccountWithConfig, from: string, to: string) {
  const propertyId = propertyIdFromAccount(account);
  if (!propertyId) throw new Error("Brakuje GA4 Property ID w konfiguracji Google Analytics.");
  const channelId = account.channelId || "pl";

  const daily = await runGaReport(account, propertyId, {
    ...baseReport(from, to),
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "totalUsers" },
      { name: "activeUsers" },
      { name: "sessions" },
      { name: "engagedSessions" },
      { name: "screenPageViews" },
      { name: "transactions" },
      { name: "purchaseRevenue" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });

  for (const row of (daily?.rows ?? []) as GaRow[]) {
    const date = toDate(gaDate(textValue(row, 0)));
    await prisma.trafficDailyMetric.upsert({
      where: { organizationId_channelId_propertyId_date: { organizationId: ORGANIZATION_ID, channelId, propertyId, date } },
      create: {
        organizationId: ORGANIZATION_ID,
        channelId,
        integrationAccountId: account.id,
        propertyId,
        date,
        totalUsers: Math.round(numberValue(row, 0)),
        activeUsers: Math.round(numberValue(row, 1)),
        sessions: Math.round(numberValue(row, 2)),
        engagedSessions: Math.round(numberValue(row, 3)),
        views: Math.round(numberValue(row, 4)),
        transactions: Math.round(numberValue(row, 5)),
        purchaseRevenue: money(numberValue(row, 6)),
      },
      update: {
        integrationAccountId: account.id,
        totalUsers: Math.round(numberValue(row, 0)),
        activeUsers: Math.round(numberValue(row, 1)),
        sessions: Math.round(numberValue(row, 2)),
        engagedSessions: Math.round(numberValue(row, 3)),
        views: Math.round(numberValue(row, 4)),
        transactions: Math.round(numberValue(row, 5)),
        purchaseRevenue: money(numberValue(row, 6)),
      },
    });
  }

  const events = await runGaReport(account, propertyId, {
    ...baseReport(from, to),
    dimensions: [{ name: "date" }, { name: "eventName" }],
    metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: ["page_view", "view_item", "add_to_cart", "begin_checkout", "purchase"] },
      },
    },
    limit: 100000,
  });
  const dailyEvents = new Map<string, { productViews: number; addToCart: number; checkoutStarted: number; transactions: number }>();
  for (const row of (events?.rows ?? []) as GaRow[]) {
    const date = toDate(gaDate(textValue(row, 0)));
    const eventName = textValue(row, 1);
    const eventCount = Math.round(numberValue(row, 0));
    const key = dateKey(date);
    const bucket = dailyEvents.get(key) ?? { productViews: 0, addToCart: 0, checkoutStarted: 0, transactions: 0 };
    if (eventName === "view_item") bucket.productViews += eventCount;
    if (eventName === "add_to_cart") bucket.addToCart += eventCount;
    if (eventName === "begin_checkout") bucket.checkoutStarted += eventCount;
    if (eventName === "purchase") bucket.transactions += eventCount;
    dailyEvents.set(key, bucket);
    await prisma.trafficEventMetric.upsert({
      where: { organizationId_channelId_propertyId_date_eventName: { organizationId: ORGANIZATION_ID, channelId, propertyId, date, eventName } },
      create: { organizationId: ORGANIZATION_ID, channelId, integrationAccountId: account.id, propertyId, date, eventName, eventCount, totalUsers: Math.round(numberValue(row, 1)) },
      update: { integrationAccountId: account.id, eventCount, totalUsers: Math.round(numberValue(row, 1)) },
    });
  }
  for (const [key, values] of dailyEvents) {
    await prisma.trafficDailyMetric.updateMany({
      where: { organizationId: ORGANIZATION_ID, channelId, propertyId, date: toDate(key) },
      data: values,
    });
  }

  const attribution = await runGaReport(account, propertyId, {
    ...baseReport(from, to),
    dimensions: [{ name: "date" }, { name: "sessionSource" }, { name: "sessionMedium" }, { name: "sessionCampaignName" }],
    metrics: [{ name: "sessions" }, { name: "screenPageViews" }, { name: "transactions" }, { name: "purchaseRevenue" }],
    limit: 100000,
  });
  for (const row of (attribution?.rows ?? []) as GaRow[]) {
    const date = toDate(gaDate(textValue(row, 0)));
    const source = textValue(row, 1);
    const medium = textValue(row, 2);
    const campaign = textValue(row, 3);
    await prisma.trafficAttributionMetric.upsert({
      where: { organizationId_channelId_propertyId_date_source_medium_campaign: { organizationId: ORGANIZATION_ID, channelId, propertyId, date, source, medium, campaign } },
      create: {
        organizationId: ORGANIZATION_ID,
        channelId,
        integrationAccountId: account.id,
        propertyId,
        date,
        source,
        medium,
        campaign,
        sessions: Math.round(numberValue(row, 0)),
        views: Math.round(numberValue(row, 1)),
        transactions: Math.round(numberValue(row, 2)),
        purchaseRevenue: money(numberValue(row, 3)),
      },
      update: {
        integrationAccountId: account.id,
        sessions: Math.round(numberValue(row, 0)),
        views: Math.round(numberValue(row, 1)),
        transactions: Math.round(numberValue(row, 2)),
        purchaseRevenue: money(numberValue(row, 3)),
      },
    });
  }

  const products = await runGaReport(account, propertyId, {
    ...baseReport(from, to),
    dimensions: [{ name: "date" }, { name: "itemId" }, { name: "itemName" }],
    metrics: [{ name: "itemsViewed" }, { name: "itemsAddedToCart" }, { name: "itemsPurchased" }, { name: "itemRevenue" }],
    limit: 100000,
  });
  for (const row of (products?.rows ?? []) as GaRow[]) {
    const date = toDate(gaDate(textValue(row, 0)));
    const itemName = textValue(row, 2, "Produkt bez nazwy");
    const itemId = textValue(row, 1, itemName).slice(0, 180);
    await prisma.trafficProductMetric.upsert({
      where: { organizationId_channelId_propertyId_date_itemId: { organizationId: ORGANIZATION_ID, channelId, propertyId, date, itemId } },
      create: {
        organizationId: ORGANIZATION_ID,
        channelId,
        integrationAccountId: account.id,
        propertyId,
        date,
        itemId,
        itemName,
        views: Math.round(numberValue(row, 0)),
        addToCart: Math.round(numberValue(row, 1)),
        purchases: Math.round(numberValue(row, 2)),
        itemRevenue: money(numberValue(row, 3)),
      },
      update: {
        integrationAccountId: account.id,
        itemName,
        views: Math.round(numberValue(row, 0)),
        addToCart: Math.round(numberValue(row, 1)),
        purchases: Math.round(numberValue(row, 2)),
        itemRevenue: money(numberValue(row, 3)),
      },
    });
  }

  await prisma.integrationAccount.update({
    where: { id: account.id },
    data: { lastSyncAt: new Date(), lastErrorCode: null, lastErrorMessage: null },
  });
  return { propertyId, channelId, dailyRows: daily?.rowCount ?? daily?.rows?.length ?? 0 };
}

export async function syncGoogleAnalyticsTraffic(account: IntegrationAccount, from = "2026-05-22", to = "2026-05-28") {
  await ensureGoogleAnalyticsPropertyId(account);
  const fullAccount = await prisma.integrationAccount.findUnique({ where: { id: account.id }, include: { configs: true, secrets: true } });
  if (!fullAccount) throw new Error("Nie znaleziono konta Google Analytics.");
  return syncAccount(fullAccount, from, to);
}

function emptyTraffic(status: string, blockers: string[], accounts: Array<{ channelId?: string | null; propertyId?: string; status: string }> = []) {
  return {
    integrationStatus: { status, blockers, accounts },
    lastSyncAt: null,
    overview: {
      kpis: {
        conversionRate: { value: 0, change: 0 },
        engagedSessions: { value: 0, change: 0 },
        engagementRate: { value: 0, change: 0 },
        revenuePerSession: { value: 0, change: 0 },
      },
      cards: {
        totalUsers: { value: 0, change: 0 },
        activeUsers: { value: 0, change: 0 },
      },
      series: [],
    },
    funnel: ["Sesje", "Wyświetlenia produktów", "Dodania do koszyka", "Rozpoczęcia płatności", "Transakcje"].map((step) => ({ step, value: 0, rate: 0, change: 0 })),
    products: [],
    attribution: [],
    events: [],
  };
}

export async function buildTrafficResponse(query: TrafficQuery) {
  const from = query.from || "2026-05-22";
  const to = query.to || "2026-05-28";
  const compareFrom = query.compareFrom || "2026-05-15";
  const compareTo = query.compareTo || "2026-05-21";
  const channelIds = (query.channels || "pl,uk").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  const accounts = await getGaAccounts(channelIds);
  if (!accounts.length) return emptyTraffic("DISCONNECTED", ["Połącz Google Analytics przez Google OAuth."]);
  const accountStates = accounts.map((account) => ({ channelId: account.channelId, propertyId: propertyIdFromAccount(account), status: account.status }));
  const configuredAccounts = accounts.filter((account) => propertyIdFromAccount(account));

  const where = { organizationId: ORGANIZATION_ID, channelId: { in: channelIds }, date: { gte: toDate(from), lte: toDate(to) } };
  const compareWhere = { organizationId: ORGANIZATION_ID, channelId: { in: channelIds }, date: { gte: toDate(compareFrom), lte: toDate(compareTo) } };
  const [daily, previousDaily, attribution, previousAttribution, events, previousEvents, products, previousProducts] = await Promise.all([
    prisma.trafficDailyMetric.findMany({ where, orderBy: { date: "asc" } }),
    prisma.trafficDailyMetric.findMany({ where: compareWhere }),
    prisma.trafficAttributionMetric.findMany({ where, orderBy: [{ sessions: "desc" }], take: 100 }),
    prisma.trafficAttributionMetric.findMany({ where: compareWhere }),
    prisma.trafficEventMetric.findMany({ where, orderBy: [{ eventCount: "desc" }] }),
    prisma.trafficEventMetric.findMany({ where: compareWhere }),
    prisma.trafficProductMetric.findMany({ where, orderBy: [{ itemRevenue: "desc" }], take: 100 }),
    prisma.trafficProductMetric.findMany({ where: compareWhere }),
  ]);

  if (!daily.length) {
    if (!configuredAccounts.length) return emptyTraffic("NEEDS_PROPERTY_ID", ["Wpisz GA4 Property ID w konfiguracji Google Analytics."], accountStates);
    return emptyTraffic("NO_DATA", ["Google Analytics jest połączone, ale nie ma jeszcze zsynchronizowanych danych dla wybranego okresu. Kliknij Sync przy Google Analytics."], accountStates);
  }

  const totals = {
    totalUsers: daily.reduce((total, item) => total + item.totalUsers, 0),
    activeUsers: daily.reduce((total, item) => total + item.activeUsers, 0),
    sessions: daily.reduce((total, item) => total + item.sessions, 0),
    engagedSessions: daily.reduce((total, item) => total + item.engagedSessions, 0),
    views: daily.reduce((total, item) => total + item.views, 0),
    productViews: daily.reduce((total, item) => total + item.productViews, 0),
    addToCart: daily.reduce((total, item) => total + item.addToCart, 0),
    checkoutStarted: daily.reduce((total, item) => total + item.checkoutStarted, 0),
    transactions: daily.reduce((total, item) => total + item.transactions, 0),
    purchaseRevenue: daily.reduce((total, item) => total + item.purchaseRevenue, 0),
  };
  const previousTotals = {
    totalUsers: previousDaily.reduce((total, item) => total + item.totalUsers, 0),
    activeUsers: previousDaily.reduce((total, item) => total + item.activeUsers, 0),
    sessions: previousDaily.reduce((total, item) => total + item.sessions, 0),
    engagedSessions: previousDaily.reduce((total, item) => total + item.engagedSessions, 0),
    productViews: previousDaily.reduce((total, item) => total + item.productViews, 0),
    addToCart: previousDaily.reduce((total, item) => total + item.addToCart, 0),
    checkoutStarted: previousDaily.reduce((total, item) => total + item.checkoutStarted, 0),
    transactions: previousDaily.reduce((total, item) => total + item.transactions, 0),
    purchaseRevenue: previousDaily.reduce((total, item) => total + item.purchaseRevenue, 0),
  };
  const byDate = new Map<string, typeof totals>();
  for (const row of daily) {
    const key = dateKey(row.date);
    const current = byDate.get(key) ?? { totalUsers: 0, activeUsers: 0, sessions: 0, engagedSessions: 0, views: 0, productViews: 0, addToCart: 0, checkoutStarted: 0, transactions: 0, purchaseRevenue: 0 };
    current.totalUsers += row.totalUsers;
    current.activeUsers += row.activeUsers;
    current.sessions += row.sessions;
    current.engagedSessions += row.engagedSessions;
    current.views += row.views;
    current.productViews += row.productViews;
    current.addToCart += row.addToCart;
    current.checkoutStarted += row.checkoutStarted;
    current.transactions += row.transactions;
    current.purchaseRevenue += row.purchaseRevenue;
    byDate.set(key, current);
  }

  const groupedAttribution = new Map<string, { source: string; medium: string; campaign: string; sessions: number; views: number; transactions: number; purchaseRevenue: number }>();
  for (const row of attribution) {
    const key = `${row.source}|${row.medium}|${row.campaign}`;
    const current = groupedAttribution.get(key) ?? { source: row.source, medium: row.medium, campaign: row.campaign, sessions: 0, views: 0, transactions: 0, purchaseRevenue: 0 };
    current.sessions += row.sessions;
    current.views += row.views;
    current.transactions += row.transactions;
    current.purchaseRevenue += row.purchaseRevenue;
    groupedAttribution.set(key, current);
  }
  const previousAttributionMap = new Map<string, { sessions: number; views: number; transactions: number }>();
  for (const row of previousAttribution) {
    const key = `${row.source}|${row.medium}|${row.campaign}`;
    const current = previousAttributionMap.get(key) ?? { sessions: 0, views: 0, transactions: 0 };
    current.sessions += row.sessions;
    current.views += row.views;
    current.transactions += row.transactions;
    previousAttributionMap.set(key, current);
  }

  const groupedProducts = new Map<string, { itemId: string; itemName: string; views: number; addToCart: number; purchases: number; itemRevenue: number }>();
  for (const row of products) {
    const current = groupedProducts.get(row.itemId) ?? { itemId: row.itemId, itemName: row.itemName, views: 0, addToCart: 0, purchases: 0, itemRevenue: 0 };
    current.views += row.views;
    current.addToCart += row.addToCart;
    current.purchases += row.purchases;
    current.itemRevenue += row.itemRevenue;
    groupedProducts.set(row.itemId, current);
  }
  const previousProductsMap = new Map<string, { views: number; addToCart: number; purchases: number }>();
  for (const row of previousProducts) {
    const current = previousProductsMap.get(row.itemId) ?? { views: 0, addToCart: 0, purchases: 0 };
    current.views += row.views;
    current.addToCart += row.addToCart;
    current.purchases += row.purchases;
    previousProductsMap.set(row.itemId, current);
  }

  const groupedEvents = new Map<string, { eventName: string; eventCount: number; totalUsers: number }>();
  for (const row of events) {
    const current = groupedEvents.get(row.eventName) ?? { eventName: row.eventName, eventCount: 0, totalUsers: 0 };
    current.eventCount += row.eventCount;
    current.totalUsers += row.totalUsers;
    groupedEvents.set(row.eventName, current);
  }
  const previousEventsMap = new Map<string, number>();
  for (const row of previousEvents) previousEventsMap.set(row.eventName, (previousEventsMap.get(row.eventName) ?? 0) + row.eventCount);

  const conversionRate = ratio(totals.transactions, totals.sessions);
  const previousConversionRate = ratio(previousTotals.transactions, previousTotals.sessions);
  const engagementRate = ratio(totals.engagedSessions, totals.sessions);
  const previousEngagementRate = ratio(previousTotals.engagedSessions, previousTotals.sessions);
  const revenuePerSession = totals.sessions ? totals.purchaseRevenue / totals.sessions : 0;
  const previousRevenuePerSession = previousTotals.sessions ? previousTotals.purchaseRevenue / previousTotals.sessions : 0;
  const funnel = [
    ["Sesje", totals.sessions, previousTotals.sessions],
    ["Wyświetlenia produktów", totals.productViews, previousTotals.productViews],
    ["Dodania do koszyka", totals.addToCart, previousTotals.addToCart],
    ["Rozpoczęcia płatności", totals.checkoutStarted, previousTotals.checkoutStarted],
    ["Transakcje", totals.transactions, previousTotals.transactions],
  ].map(([step, value, previous]) => ({ step, value, rate: ratio(Number(value), totals.sessions), change: pct(Number(value), Number(previous)) }));

  return {
    integrationStatus: { status: "READY", blockers: [], accounts: accountStates },
    lastSyncAt: configuredAccounts.map((account) => account.lastSyncAt).filter(Boolean).sort().at(-1) ?? null,
    overview: {
      kpis: {
        conversionRate: { value: conversionRate, change: pct(conversionRate, previousConversionRate) },
        engagedSessions: { value: totals.engagedSessions, change: pct(totals.engagedSessions, previousTotals.engagedSessions) },
        engagementRate: { value: engagementRate, change: pct(engagementRate, previousEngagementRate) },
        revenuePerSession: { value: money(revenuePerSession), change: pct(revenuePerSession, previousRevenuePerSession) },
      },
      cards: {
        totalUsers: { value: totals.totalUsers, change: pct(totals.totalUsers, previousTotals.totalUsers) },
        activeUsers: { value: totals.activeUsers, change: pct(totals.activeUsers, previousTotals.activeUsers) },
      },
      series: Array.from(byDate.entries()).map(([date, value]) => ({
        date,
        label: date.slice(5),
        users: value.totalUsers,
        activeUsers: value.activeUsers,
        sessions: value.sessions,
        views: value.views,
        transactions: value.transactions,
        revenue: money(value.purchaseRevenue),
      })),
    },
    funnel,
    products: Array.from(groupedProducts.values()).sort((a, b) => b.itemRevenue - a.itemRevenue).map((row) => {
      const previous = previousProductsMap.get(row.itemId);
      return { ...row, itemRevenue: money(row.itemRevenue), changes: { views: pct(row.views, previous?.views ?? 0), addToCart: pct(row.addToCart, previous?.addToCart ?? 0), purchases: pct(row.purchases, previous?.purchases ?? 0) } };
    }),
    attribution: Array.from(groupedAttribution.values()).sort((a, b) => b.sessions - a.sessions).map((row) => {
      const previous = previousAttributionMap.get(`${row.source}|${row.medium}|${row.campaign}`);
      return {
        ...row,
        purchaseRevenue: money(row.purchaseRevenue),
        conversionRate: ratio(row.transactions, row.sessions),
        changes: { sessions: pct(row.sessions, previous?.sessions ?? 0), views: pct(row.views, previous?.views ?? 0), transactions: pct(row.transactions, previous?.transactions ?? 0), conversionRate: pct(ratio(row.transactions, row.sessions), ratio(previous?.transactions ?? 0, previous?.sessions ?? 0)) },
      };
    }),
    events: Array.from(groupedEvents.values()).sort((a, b) => b.eventCount - a.eventCount).map((row) => ({ ...row, change: pct(row.eventCount, previousEventsMap.get(row.eventName) ?? 0) })),
  };
}
