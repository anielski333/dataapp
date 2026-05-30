import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { prisma } from "./db.js";
import { discoverGoogleAnalyticsProperties, ensureGoogleAnalyticsPropertyId, syncGoogleAnalyticsTraffic } from "./traffic.js";

const ORGANIZATION_ID = "org-demo-sales";

type IntegrationProvider = {
  code: string;
  name: string;
  category: string;
  authType: string;
  composioToolkit?: string;
  defaultScopes: string[];
  fields: Array<{ name: string; label: string; type: "text" | "password" | "url" | "select"; required?: boolean; secret?: boolean; placeholder?: string; options?: string[] }>;
  syncOptions: Array<{ key: string; label: string; defaultEnabled: boolean }>;
  mappingTypes: Array<{ key: string; label: string }>;
  tabs: string[];
};

const SECRET_FIELDS = new Set(["accessToken", "refreshToken", "apiToken", "apiKey", "consumerKey", "consumerSecret", "clientSecret", "developerToken", "clientId", "serviceAccountPrivateKey"]);
const COMPOSIO_API_BASE = "https://backend.composio.dev/api/v3";
const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v22";
const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v25.0";
const TIKTOK_API_VERSION = process.env.TIKTOK_API_VERSION || "v1.3";
const GOOGLE_OAUTH_SCOPES: Record<string, string[]> = {
  "google-analytics": [
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
  ],
  "google-ads": [
    "https://www.googleapis.com/auth/adwords",
    "https://www.googleapis.com/auth/userinfo.email",
  ],
};

const PROVIDERS: IntegrationProvider[] = [
  {
    code: "woocommerce",
    name: "WooCommerce",
    category: "shop",
    authType: "api-key",
    defaultScopes: ["products", "prices", "orders", "webhooks"],
    fields: [
      { name: "storeUrl", label: "URL sklepu", type: "url", required: true, placeholder: "https://twojsklep.pl" },
      { name: "consumerKey", label: "Consumer Key", type: "text", required: true, secret: true, placeholder: "ck_xxxxxxxxx" },
      { name: "consumerSecret", label: "Consumer Secret", type: "password", required: true, secret: true, placeholder: "cs_xxxxxxxxx" },
      { name: "environment", label: "Tryb", type: "select", required: true, options: ["Produkcja", "Test"] },
    ],
    syncOptions: [
      { key: "products", label: "Pobieraj produkty", defaultEnabled: true },
      { key: "orders", label: "Pobieraj zamówienia", defaultEnabled: true },
      { key: "prices", label: "Aktualizuj ceny", defaultEnabled: true },
      { key: "stock", label: "Aktualizuj stany", defaultEnabled: true },
    ],
    mappingTypes: [
      { key: "status", label: "Statusy zamówień" },
      { key: "delivery", label: "Metody dostawy" },
      { key: "payment", label: "Płatności" },
    ],
    tabs: ["connection", "sync", "mappings", "logs", "settings"],
  },
  {
    code: "google-analytics",
    name: "Google Analytics",
    category: "analytics",
    authType: "oauth2",
    composioToolkit: process.env.COMPOSIO_TOOLKIT_GOOGLE_ANALYTICS || "google_analytics",
    defaultScopes: ["sessions", "events", "transactions", "attribution"],
    fields: [
      { name: "propertyId", label: "GA4 Property ID", type: "text", required: true },
      { name: "serviceAccountClientEmail", label: "Service account client_email", type: "text", required: false, secret: true },
      { name: "serviceAccountPrivateKey", label: "Service account private_key", type: "password", required: false, secret: true },
      { name: "propertyName", label: "Nazwa widoku w aplikacji", type: "text", required: false, placeholder: "np. Sklep PL" },
    ],
    syncOptions: [
      { key: "traffic", label: "Pobieraj ruch", defaultEnabled: true },
      { key: "events", label: "Pobieraj zdarzenia", defaultEnabled: true },
      { key: "transactions", label: "Pobieraj transakcje GA", defaultEnabled: true },
    ],
    mappingTypes: [{ key: "campaign", label: "Kampanie" }],
    tabs: ["connection", "sync", "mappings", "logs"],
  },
  {
    code: "google-ads",
    name: "Google Ads",
    category: "ads",
    authType: "oauth2",
    composioToolkit: process.env.COMPOSIO_TOOLKIT_GOOGLE_ADS || "googleads",
    defaultScopes: ["campaigns", "costs", "clicks", "conversions"],
    fields: [
      { name: "customerId", label: "Customer ID", type: "text", required: true },
      { name: "developerToken", label: "Developer token", type: "password", required: true, secret: true },
      { name: "clientId", label: "OAuth Client ID", type: "text", required: true, secret: true },
      { name: "clientSecret", label: "OAuth Client Secret", type: "password", required: true, secret: true },
      { name: "refreshToken", label: "OAuth Refresh token", type: "password", required: true, secret: true },
      { name: "loginCustomerId", label: "Login Customer ID / MCC", type: "text", required: false },
    ],
    syncOptions: [
      { key: "campaigns", label: "Pobieraj kampanie", defaultEnabled: true },
      { key: "costs", label: "Pobieraj koszty reklam", defaultEnabled: true },
      { key: "conversions", label: "Pobieraj konwersje", defaultEnabled: true },
    ],
    mappingTypes: [{ key: "campaign", label: "Kampanie" }],
    tabs: ["connection", "sync", "mappings", "logs"],
  },
  {
    code: "meta-ads",
    name: "Meta Ads",
    category: "ads",
    authType: "oauth2",
    composioToolkit: process.env.COMPOSIO_TOOLKIT_META_ADS || "facebook",
    defaultScopes: ["campaigns", "spend", "purchases", "roas"],
    fields: [
      { name: "adAccountId", label: "Ad Account ID", type: "text", required: true },
      { name: "accessToken", label: "Access token", type: "password", required: true, secret: true },
    ],
    syncOptions: [
      { key: "campaigns", label: "Pobieraj kampanie", defaultEnabled: true },
      { key: "spend", label: "Pobieraj wydatki", defaultEnabled: true },
      { key: "purchases", label: "Pobieraj zakupy", defaultEnabled: true },
    ],
    mappingTypes: [{ key: "campaign", label: "Kampanie" }],
    tabs: ["connection", "sync", "logs"],
  },
  {
    code: "tiktok-ads",
    name: "TikTok Ads",
    category: "ads",
    authType: "api-key",
    defaultScopes: ["campaigns", "spend", "clicks", "conversions"],
    fields: [
      { name: "advertiserId", label: "Advertiser ID", type: "text", required: true },
      { name: "accessToken", label: "Access token", type: "password", required: true, secret: true },
    ],
    syncOptions: [
      { key: "campaigns", label: "Pobieraj kampanie", defaultEnabled: true },
      { key: "spend", label: "Pobieraj wydatki", defaultEnabled: true },
      { key: "conversions", label: "Pobieraj konwersje", defaultEnabled: true },
    ],
    mappingTypes: [{ key: "campaign", label: "Kampanie" }],
    tabs: ["connection", "sync", "logs"],
  },
  {
    code: "additional-costs",
    name: "Koszty dodatkowe",
    category: "costs",
    authType: "manual",
    defaultScopes: ["costs", "imports"],
    fields: [
      { name: "sourceName", label: "Nazwa źródła", type: "text", required: true },
      { name: "importMode", label: "Tryb importu", type: "select", required: true, options: ["CSV", "API", "Ręcznie"] },
    ],
    syncOptions: [{ key: "costs", label: "Pobieraj koszty dodatkowe", defaultEnabled: true }],
    mappingTypes: [{ key: "cost_type", label: "Typy kosztów" }],
    tabs: ["connection", "sync", "logs"],
  },
];

export const integrationsRouter = Router();

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

function maskSecret(value: string) {
  if (!value) return "";
  if (value.length < 10) return "***";
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function publicAccount(account: any) {
  if (!account) return null;
  return {
    ...account,
    scopes: parseJson(account.scopesJson, []),
    metadata: parseJson(account.metadataJson, {}),
    settings: parseJson(account.settingsJson, {}),
    accessTokenEnc: undefined,
    refreshTokenEnc: undefined,
    tokenMasked: account.accessTokenEnc ? maskSecret(account.accessTokenEnc) : undefined,
    scopesJson: undefined,
    metadataJson: undefined,
    settingsJson: undefined,
    configs: account.configs?.map((config: any) => ({ ...config, value: parseJson(config.valueJson, null), valueJson: undefined, rawPayload: parseJson(config.rawPayloadJson, null), rawPayloadJson: undefined })),
    secrets: account.secrets?.map((secret: any) => ({ ...secret, secretRef: undefined, metadata: parseJson(secret.metadataJson, {}), metadataJson: undefined })),
    mappings: account.mappings?.map((mapping: any) => ({ ...mapping, rawPayload: parseJson(mapping.rawPayloadJson, null), rawPayloadJson: undefined })),
  };
}

function publicLog(log: any) {
  return {
    ...log,
    requestPayload: parseJson(log.requestPayloadJson, null),
    responsePayload: parseJson(log.responsePayloadJson, null),
    requestPayloadJson: undefined,
    responsePayloadJson: undefined,
  };
}

function readinessFor(provider: IntegrationProvider, account: any | null) {
  if (!account) {
    return {
      provider: provider.code,
      name: provider.name,
      category: provider.category,
      authType: provider.authType,
      status: "NEEDS_CONFIGURATION",
      runtimeMode: "not-configured",
      blockers: ["Brak konta integracji"],
    };
  }
  if (account.status === "CONNECTED") {
    if (account.lastErrorCode || account.lastErrorMessage) {
      return {
        provider: provider.code,
        name: provider.name,
        category: provider.category,
        authType: provider.authType,
        status: "CONNECTED_WITH_ERRORS",
        runtimeMode: "read-blocked",
        blockers: [account.lastErrorMessage || account.lastErrorCode || "Ostatni test integracji zakończył się błędem"],
      };
    }
    return {
      provider: provider.code,
      name: provider.name,
      category: provider.category,
      authType: provider.authType,
      status: "READY",
      runtimeMode: "write-ready",
      blockers: [],
    };
  }
  return {
    provider: provider.code,
    name: provider.name,
    category: provider.category,
    authType: provider.authType,
    status: account.status,
    runtimeMode: "dry-run",
    blockers: account.lastErrorMessage ? [account.lastErrorMessage] : ["Integracja nieaktywna"],
  };
}

function sortAccounts(accounts: any[]) {
  return [...accounts].sort((left, right) => {
    const leftIndex = PROVIDERS.findIndex((provider) => provider.code === left.provider);
    const rightIndex = PROVIDERS.findIndex((provider) => provider.code === right.provider);
    return leftIndex - rightIndex || String(left.name).localeCompare(String(right.name), "pl");
  });
}

function getComposioApiKey() {
  return process.env.COMPOSIO_API_KEY?.trim() || "";
}

function getComposioUserId() {
  return `ahub_org_${ORGANIZATION_ID}`;
}

function getComposioCallbackUrl(provider: IntegrationProvider, channelId: string) {
  const base = process.env.COMPOSIO_CALLBACK_URL || "http://localhost:4105/api/integrations/composio/callback";
  const url = new URL(base);
  url.searchParams.set("provider", provider.code);
  url.searchParams.set("channelId", channelId);
  return url.toString();
}

function getGoogleOAuthClient() {
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "",
    redirectUri: process.env.GOOGLE_OAUTH_CALLBACK_URL?.trim() || "http://localhost:4105/api/integrations/google/callback",
  };
}

function encodeState(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeState(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { provider: string; channelId: string; nonce?: string };
}

function googleOAuthUrl(provider: IntegrationProvider, channelId: string) {
  const client = getGoogleOAuthClient();
  if (!client.clientId || !client.clientSecret) {
    throw new Error("Brak GOOGLE_OAUTH_CLIENT_ID lub GOOGLE_OAUTH_CLIENT_SECRET w apps/api/.env.");
  }
  const scopes = GOOGLE_OAUTH_SCOPES[provider.code];
  if (!scopes?.length) {
    throw new Error("Ta integracja nie obsługuje natywnego logowania Google.");
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", client.clientId);
  url.searchParams.set("redirect_uri", client.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", encodeState({ provider: provider.code, channelId, nonce: randomUUID() }));
  return url.toString();
}

async function exchangeGoogleCode(code: string) {
  const client = getGoogleOAuthClient();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: client.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok || !data?.access_token) {
    throw new Error(`Google OAuth token failed: ${response.status} ${data?.error_description || data?.error || "unknown error"}`);
  }
  return data as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string };
}

async function getGoogleUserEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({})) as any;
  return typeof data?.email === "string" ? data.email : "";
}

function getComposioAuthConfigOverride(providerCode: string) {
  const key =
    providerCode === "google-analytics" ? "COMPOSIO_AUTH_CONFIG_GOOGLE_ANALYTICS" :
    providerCode === "google-ads" ? "COMPOSIO_AUTH_CONFIG_GOOGLE_ADS" :
    providerCode === "meta-ads" ? "COMPOSIO_AUTH_CONFIG_META_ADS" :
    "";
  return key ? process.env[key]?.trim() || "" : "";
}

async function resolveComposioAuthConfigId(apiKey: string, toolkitSlug: string, configuredAuthConfigId?: string) {
  if (configuredAuthConfigId) return configuredAuthConfigId;
  const response = await fetch(`${COMPOSIO_API_BASE}/auth_configs`, {
    headers: { "x-api-key": apiKey },
  });
  if (!response.ok) {
    throw new Error(`Composio auth configs failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json() as any;
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  const config = items.find((item: any) => item?.toolkit?.slug === toolkitSlug && (!item?.status || item.status === "ENABLED"));
  if (!config?.id) {
    throw new Error(`Brak aktywnej konfiguracji Composio dla toolkit: ${toolkitSlug}`);
  }
  return String(config.id);
}

async function createComposioConnectLink(apiKey: string, authConfigId: string, userId: string, redirectUrl: string) {
  const response = await fetch(`${COMPOSIO_API_BASE}/connected_accounts/link`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: json({ auth_config_id: authConfigId, user_id: userId, redirect_url: redirectUrl }),
  });
  if (!response.ok) {
    throw new Error(`Composio connect link failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json() as any;
  const redirect = data?.redirect_url || data?.redirectUrl;
  if (!redirect) {
    throw new Error("Composio nie zwróciło linku logowania.");
  }
  return String(redirect);
}

async function executeComposioTool(toolSlug: string, connectedAccountId: string, args: Record<string, unknown> = {}) {
  const apiKey = getComposioApiKey();
  if (!apiKey) {
    throw new Error("Brak COMPOSIO_API_KEY w apps/api/.env.");
  }
  const response = await fetch(`${COMPOSIO_API_BASE}/tools/execute/${toolSlug}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: json({
      connected_account_id: connectedAccountId,
      entity_id: getComposioUserId(),
      user_id: getComposioUserId(),
      arguments: args,
    }),
  });
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok || data?.successful === false) {
    const message = data?.error?.message || data?.error || data?.data?.message || `Composio tool ${toolSlug} failed`;
    throw new Error(String(message));
  }
  return data;
}

async function validateComposioGoogleAdsAccount(account: any) {
  if (!account?.externalAccountId) {
    throw new Error("Brak identyfikatora connected account Composio.");
  }
  return executeComposioTool("GOOGLEADS_GET_CUSTOMER_LISTS", account.externalAccountId);
}

async function listActiveComposioAccounts(apiKey: string) {
  const response = await fetch(`${COMPOSIO_API_BASE}/connected_accounts?user_id=${encodeURIComponent(getComposioUserId())}`, {
    headers: { "x-api-key": apiKey },
  });
  if (!response.ok) {
    throw new Error(`Composio connected accounts failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json() as any;
  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .filter((item: any) => item?.status === "ACTIVE" && item?.is_disabled !== true)
    .sort((left: any, right: any) => String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || "")));
}

async function reconcileComposioAccounts() {
  const apiKey = getComposioApiKey();
  if (!apiKey) return;
  let connectedAccounts: any[] = [];
  try {
    connectedAccounts = await listActiveComposioAccounts(apiKey);
  } catch (error) {
    await prisma.integrationLog.create({
      data: {
        organizationId: ORGANIZATION_ID,
        provider: "composio",
        operation: "integration.composio.reconcile",
        status: "ERROR",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    return;
  }

  for (const provider of PROVIDERS.filter((item) => item.composioToolkit)) {
    const composioAccount = connectedAccounts.find((item: any) => item?.toolkit?.slug === provider.composioToolkit);
    if (!composioAccount?.id) continue;
    const latestLinkLog = await prisma.integrationLog.findFirst({
      where: { organizationId: ORGANIZATION_ID, provider: provider.code, operation: "integration.composio.connect_link" },
      orderBy: { createdAt: "desc" },
    });
    const channelId = parseJson<any>(latestLinkLog?.requestPayloadJson, {})?.channelId || "pl";
    const metadata = {
      source: "composio",
      authMode: "composio",
      channelId,
      composioUserId: getComposioUserId(),
      composioConnectedAccountId: composioAccount.id,
      toolkit: provider.composioToolkit,
      wordId: composioAccount.word_id || null,
      status: composioAccount.status,
      updatedAt: composioAccount.updated_at || null,
    };
    const existing = await prisma.integrationAccount.findFirst({ where: { organizationId: ORGANIZATION_ID, provider: provider.code, channelId } });
    const account = existing
      ? await prisma.integrationAccount.update({
          where: { id: existing.id },
          data: {
            name: provider.name,
            status: "CONNECTED",
            externalAccountId: String(composioAccount.id),
            externalAccountType: "composio",
            externalAccountName: composioAccount.word_id || `${provider.name} ${String(channelId).toUpperCase()}`,
            scopesJson: json(provider.defaultScopes),
            settingsJson: json({ syncOptions: provider.syncOptions.filter((item) => item.defaultEnabled).map((item) => item.key) }),
            metadataJson: json(metadata),
            lastErrorCode: null,
            lastErrorMessage: null,
            lastTestAt: new Date(),
          },
        })
      : await prisma.integrationAccount.create({
          data: {
            organizationId: ORGANIZATION_ID,
            provider: provider.code,
            name: provider.name,
            status: "CONNECTED",
            channelId,
            externalAccountId: String(composioAccount.id),
            externalAccountType: "composio",
            externalAccountName: composioAccount.word_id || `${provider.name} ${String(channelId).toUpperCase()}`,
            scopesJson: json(provider.defaultScopes),
            settingsJson: json({ syncOptions: provider.syncOptions.filter((item) => item.defaultEnabled).map((item) => item.key) }),
            metadataJson: json(metadata),
            lastTestAt: new Date(),
          },
        });
    const alreadyLogged = await prisma.integrationLog.findFirst({
      where: {
        organizationId: ORGANIZATION_ID,
        provider: provider.code,
        operation: "integration.composio.reconcile",
        requestPayloadJson: { contains: String(composioAccount.id) },
      },
    });
    if (!alreadyLogged) {
      await prisma.integrationLog.create({
        data: {
          organizationId: ORGANIZATION_ID,
          provider: provider.code,
          operation: "integration.composio.reconcile",
          status: "CONNECTED",
          requestPayloadJson: json({ channelId, composioConnectedAccountId: composioAccount.id, accountId: account.id }),
        },
      });
    }
  }
}

async function ensureDemoIntegrations() {
  const existing = await prisma.integrationAccount.count({ where: { organizationId: ORGANIZATION_ID } });
  if (existing > 0) {
    await normalizeDemoIntegrationStatuses();
    return;
  }
  const defaults = [
    ["pl", "woocommerce"],
    ["pl", "google-analytics"],
    ["pl", "google-ads"],
    ["pl", "meta-ads"],
    ["pl", "tiktok-ads"],
    ["pl", "additional-costs"],
    ["uk", "woocommerce"],
    ["uk", "google-analytics"],
    ["uk", "google-ads"],
    ["uk", "meta-ads"],
    ["uk", "tiktok-ads"],
  ] as const;
  for (const [channelId, providerCode] of defaults) {
    const provider = PROVIDERS.find((item) => item.code === providerCode);
    if (!provider) continue;
    const account = await prisma.integrationAccount.create({
      data: {
        organizationId: ORGANIZATION_ID,
        provider: provider.code,
        name: provider.name,
        status: "DISCONNECTED",
        channelId,
        externalAccountType: provider.authType,
        externalAccountName: `${provider.name} ${channelId.toUpperCase()}`,
        scopesJson: json(provider.defaultScopes),
        metadataJson: json({ source: "demo-seed", channelId }),
        settingsJson: json({ syncOptions: provider.syncOptions.filter((item) => item.defaultEnabled).map((item) => item.key) }),
        lastErrorCode: "NEEDS_LOGIN",
        lastErrorMessage: "Źródło czeka na logowanie lub konfigurację.",
      },
    });
    await prisma.integrationLog.create({
      data: {
        organizationId: ORGANIZATION_ID,
        provider: provider.code,
        operation: "integration.seed",
        status: "CONFIGURED",
        responsePayloadJson: json({ channelId, accountId: account.id }),
      },
    });
  }
  await normalizeDemoIntegrationStatuses();
}

async function normalizeDemoIntegrationStatuses() {
  await prisma.integrationAccount.updateMany({
    where: {
      organizationId: ORGANIZATION_ID,
      OR: [
        { metadataJson: { contains: '"source":"demo-seed"' } },
        { metadataJson: { contains: '"source":"integrations-v2-compatible"' } },
      ],
    },
    data: {
      status: "DISCONNECTED",
      lastErrorCode: "NEEDS_LOGIN",
      lastErrorMessage: "Źródło czeka na logowanie lub konfigurację.",
    },
  });
}

function missingRequiredFields(provider: IntegrationProvider, body: Record<string, unknown>) {
  return provider.fields
    .filter((field) => field.required)
    .filter((field) => {
      const value = body[field.name];
      return value === undefined || value === null || String(value).trim() === "";
    })
    .map((field) => field.label);
}

async function readConnectionValue(accountId: string, providerCode: string, key: string) {
  const [config, secret] = await Promise.all([
    prisma.integrationConfig.findFirst({ where: { integrationAccountId: accountId, provider: providerCode, key } }),
    prisma.integrationSecret.findFirst({ where: { integrationAccountId: accountId, provider: providerCode, key } }),
  ]);
  if (secret?.secretRef) return secret.secretRef;
  const value = parseJson<string | null>(config?.valueJson, null);
  if (value) return value;
  if (key === "clientId") return process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || "";
  if (key === "clientSecret") return process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "";
  return "";
}

function cleanCustomerId(value: string) {
  return value.replace(/\D/g, "");
}

function cleanMetaAdAccountId(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed.replace(/\D/g, "")}`;
}

function metaActionValue(items: unknown, actionTypes: string[]) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, item: any) => {
    const actionType = String(item?.action_type || "");
    return actionTypes.includes(actionType) ? total + Number(item?.value || 0) : total;
  }, 0);
}

function metaPurchases(items: unknown) {
  return metaActionValue(items, [
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_conversion.purchase",
  ]);
}

function tiktokNumber(value: unknown) {
  if (typeof value === "string" && value.trim().startsWith("<")) return Number(value.replace(/\D/g, "")) || 0;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstMetricValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  return 0;
}

function normalizeMatchValue(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
}

function money(value: number) {
  return Number(value.toFixed(2));
}

function toUtcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

async function getGoogleAdsAccessToken(accountId: string) {
  const clientId = await readConnectionValue(accountId, "google-ads", "clientId");
  const clientSecret = await readConnectionValue(accountId, "google-ads", "clientSecret");
  const refreshToken = await readConnectionValue(accountId, "google-ads", "refreshToken");
  const missing = [
    ["OAuth Client ID", clientId],
    ["OAuth Client Secret", clientSecret],
    ["OAuth Refresh token", refreshToken],
  ].filter(([, value]) => !String(value).trim()).map(([label]) => label);
  if (missing.length > 0) {
    throw new Error(`Brakuje poświadczeń OAuth Google Ads: ${missing.join(", ")}`);
  }
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
    throw new Error(`Google OAuth token failed: ${response.status} ${data?.error_description || data?.error || "unknown error"}`);
  }
  return String(data.access_token);
}

async function syncGoogleAdsCampaigns(account: any, from = "2026-05-22", to = "2026-05-28") {
  if (account.externalAccountType === "composio") {
    const hasDirectConfig = Boolean(
      await readConnectionValue(account.id, "google-ads", "customerId") &&
      await readConnectionValue(account.id, "google-ads", "developerToken") &&
      await readConnectionValue(account.id, "google-ads", "clientId") &&
      await readConnectionValue(account.id, "google-ads", "clientSecret") &&
      await readConnectionValue(account.id, "google-ads", "refreshToken")
    );
    if (!hasDirectConfig) {
      throw new Error("Google Ads OAuth przez Composio jest połączony, ale import metryk wymaga włączonego Composio Proxy Execute albo ręcznych poświadczeń Google Ads API.");
    }
  }
  const customerId = cleanCustomerId(await readConnectionValue(account.id, "google-ads", "customerId"));
  const developerToken = await readConnectionValue(account.id, "google-ads", "developerToken");
  const loginCustomerId = cleanCustomerId(await readConnectionValue(account.id, "google-ads", "loginCustomerId"));
  const channelId = String(account.channelId || "pl").toLowerCase();
  const missing = [
    ["Customer ID", customerId],
    ["Developer token", developerToken],
  ].filter(([, value]) => !String(value).trim()).map(([label]) => label);
  if (missing.length > 0) {
    throw new Error(`Brakuje konfiguracji Google Ads: ${missing.join(", ")}`);
  }

  const accessToken = await getGoogleAdsAccessToken(account.id);
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      segments.date,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.impressions,
      metrics.clicks
    FROM campaign
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status != 'REMOVED'
  `;
  const headers: Record<string, string> = {
    "authorization": `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "content-type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;
  const response = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers,
    body: json({ query }),
  });
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    throw new Error(`Google Ads searchStream failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  }
  const chunks = Array.isArray(data) ? data : [data];
  const byCampaign = new Map<string, { id: string; name: string; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>();
  const byCampaignDay = new Map<string, { campaignId: string; campaignName: string; date: Date; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>();
  const byDay = new Map<string, { date: Date; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>();
  for (const chunk of chunks) {
    for (const row of chunk?.results ?? []) {
      const id = String(row?.campaign?.id || "");
      if (!id) continue;
      const current = byCampaign.get(id) ?? { id, name: row?.campaign?.name || `Google Ads ${id}`, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
      const spend = Number(row?.metrics?.costMicros || 0) / 1_000_000;
      const revenue = Number(row?.metrics?.conversionsValue || 0);
      const impressions = Number(row?.metrics?.impressions || 0);
      const clicks = Number(row?.metrics?.clicks || 0);
      const conversions = Math.round(Number(row?.metrics?.conversions || 0));
      current.spend += spend;
      current.revenue += revenue;
      current.impressions += impressions;
      current.clicks += clicks;
      current.conversions += conversions;
      byCampaign.set(id, current);
      const day = toUtcDate(String(row?.segments?.date || from));
      const dayKey = dateKey(day);
      const campaignDayKey = `${id}|${dayKey}`;
      const campaignDay = byCampaignDay.get(campaignDayKey) ?? { campaignId: id, campaignName: current.name, date: day, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
      campaignDay.spend += spend;
      campaignDay.revenue += revenue;
      campaignDay.impressions += impressions;
      campaignDay.clicks += clicks;
      campaignDay.conversions += conversions;
      byCampaignDay.set(campaignDayKey, campaignDay);
      const daily = byDay.get(dayKey) ?? { date: day, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
      daily.spend += spend;
      daily.revenue += revenue;
      daily.impressions += impressions;
      daily.clicks += clicks;
      daily.conversions += conversions;
      byDay.set(dayKey, daily);
    }
  }
  for (const campaign of byCampaign.values()) {
    await prisma.salesCampaign.upsert({
      where: { id: `google-${campaign.id}` },
      create: {
        id: `google-${campaign.id}`,
        provider: "Google",
        name: campaign.name,
        spend: money(campaign.spend),
        revenue: money(campaign.revenue),
        impressions: campaign.impressions,
        clicks: campaign.clicks,
        conversions: campaign.conversions,
      },
      update: {
        provider: "Google",
        name: campaign.name,
        spend: money(campaign.spend),
        revenue: money(campaign.revenue),
        impressions: campaign.impressions,
        clicks: campaign.clicks,
        conversions: campaign.conversions,
      },
    });
  }
  for (const row of byCampaignDay.values()) {
    const campaignId = `google-${row.campaignId}`;
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
      `${campaignId}-${channelId}-${dateKey(row.date)}`,
      campaignId,
      "Google",
      row.campaignName,
      channelId,
      row.date,
      money(row.spend),
      money(row.revenue),
      row.impressions,
      row.clicks,
      row.conversions,
      "Google Ads API",
    );
  }
  const replacedCacheCampaigns = await deleteMatchedCacheCampaigns("Google", "google-", Array.from(byCampaign.values()).map((campaign) => campaign.name));
  await refreshSalesDailyMetricsFromCampaignDaily(channelId, Array.from(byDay.values()).map((row) => row.date));
  return { campaigns: byCampaign.size, campaignDailyRows: byCampaignDay.size, dailyRows: byDay.size, replacedCacheCampaigns, from, to };
}

async function fetchMetaInsightsPage(url: URL, accessToken: string) {
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url.toString());
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    throw new Error(`Meta Ads insights failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

async function refreshSalesDailyMetricsFromCampaignDaily(channelId: string, dates: Date[]) {
  const uniqueDates = Array.from(new Set(dates.map(dateKey))).map(toUtcDate);
  for (const date of uniqueDates) {
    const rows = await prisma.$queryRawUnsafe<Array<{ spend: number | null; revenue: number | null; impressions: number | null; clicks: number | null; conversions: number | null }>>(
      `SELECT
         SUM("spend") as spend,
         SUM("revenue") as revenue,
         SUM("impressions") as impressions,
         SUM("clicks") as clicks,
         SUM("conversions") as conversions
       FROM "SalesCampaignDailyMetric"
       WHERE "channelId" = ? AND "date" = ?`,
      channelId,
      date,
    );
    const totals = rows[0] ?? { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
    const spend = money(Number(totals.spend || 0));
    const revenue = money(Number(totals.revenue || 0));
    const impressions = Math.round(Number(totals.impressions || 0));
    const clicks = Math.round(Number(totals.clicks || 0));
    const conversions = Math.round(Number(totals.conversions || 0));
    const existing = await prisma.salesDailyMetric.findUnique({ where: { channelId_date: { channelId, date } } });
    await prisma.salesDailyMetric.upsert({
      where: { channelId_date: { channelId, date } },
      create: {
        channelId,
        date,
        revenueNet: revenue,
        totalCost: spend,
        productCost: 0,
        mediaCost: spend,
        additionalCost: 0,
        marketplaceCost: 0,
        discounts: 0,
        orders: conversions,
        unitsSold: 0,
        newCustomers: 0,
        returningCustomers: 0,
        sessions: clicks,
        productViews: 0,
        addToCart: 0,
        checkoutStarted: 0,
        transactions: conversions,
        impressions,
        clicks,
        adConversions: conversions,
      },
      update: {
        revenueNet: revenue,
        mediaCost: spend,
        totalCost: existing ? money(existing.totalCost - existing.mediaCost + spend) : spend,
        sessions: clicks,
        transactions: conversions,
        orders: conversions,
        impressions,
        clicks,
        adConversions: conversions,
      },
    });
  }
}

async function deleteMatchedCacheCampaigns(provider: string, protectedPrefix: string, campaignNames: string[]) {
  const names = new Set(campaignNames.map(normalizeMatchValue).filter(Boolean));
  if (!names.size) return 0;
  const existing = await prisma.salesCampaign.findMany({
    where: { provider },
    select: { id: true, name: true },
  });
  const matchedIds = existing
    .filter((campaign) => !campaign.id.startsWith("import-") && !campaign.id.startsWith(protectedPrefix))
    .filter((campaign) => names.has(normalizeMatchValue(campaign.name)))
    .map((campaign) => campaign.id);
  if (!matchedIds.length) return 0;
  const placeholders = matchedIds.map(() => "?").join(",");
  await prisma.$executeRawUnsafe(`DELETE FROM "SalesCampaignDailyMetric" WHERE "campaignId" IN (${placeholders})`, ...matchedIds);
  const result = await prisma.salesCampaign.deleteMany({ where: { id: { in: matchedIds } } });
  return result.count;
}

async function syncMetaAdsCampaigns(account: any, from = "2026-05-22", to = "2026-05-28") {
  const adAccountId = cleanMetaAdAccountId(await readConnectionValue(account.id, "meta-ads", "adAccountId"));
  const accessToken = await readConnectionValue(account.id, "meta-ads", "accessToken");
  const channelId = String(account.channelId || "pl").toLowerCase();
  const missing = [
    ["Ad Account ID", adAccountId.replace(/^act_$/, "")],
    ["Access token", accessToken],
  ].filter(([, value]) => !String(value).trim()).map(([label]) => label);
  if (missing.length > 0) {
    throw new Error(`Brakuje konfiguracji Meta Ads: ${missing.join(", ")}`);
  }

  const byCampaign = new Map<string, { id: string; name: string; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>();
  const byCampaignDay = new Map<string, { campaignId: string; campaignName: string; date: Date; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>();
  const byDay = new Map<string, { date: Date; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>();
  let nextUrl: string | null = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${adAccountId}/insights`;
  while (nextUrl) {
    const url = new URL(nextUrl);
    if (!url.searchParams.has("fields")) {
      url.searchParams.set("level", "campaign");
      url.searchParams.set("time_increment", "1");
      url.searchParams.set("fields", "campaign_id,campaign_name,date_start,date_stop,spend,impressions,clicks,actions,action_values");
      url.searchParams.set("time_range", JSON.stringify({ since: from, until: to }));
      url.searchParams.set("limit", "200");
    }
    const data = await fetchMetaInsightsPage(url, accessToken);
    for (const row of data?.data ?? []) {
      const id = String(row?.campaign_id || "");
      if (!id) continue;
      const current = byCampaign.get(id) ?? { id, name: row?.campaign_name || `Meta Ads ${id}`, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
      const spend = Number(row?.spend || 0);
      const revenue = metaPurchases(row?.action_values);
      const impressions = Math.round(Number(row?.impressions || 0));
      const clicks = Math.round(Number(row?.clicks || 0));
      const conversions = Math.round(metaPurchases(row?.actions));
      current.spend += spend;
      current.revenue += revenue;
      current.impressions += impressions;
      current.clicks += clicks;
      current.conversions += conversions;
      byCampaign.set(id, current);
      const day = toUtcDate(String(row?.date_start || from));
      const dayKey = dateKey(day);
      const campaignDayKey = `${id}|${dayKey}`;
      const campaignDay = byCampaignDay.get(campaignDayKey) ?? { campaignId: id, campaignName: current.name, date: day, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
      campaignDay.spend += spend;
      campaignDay.revenue += revenue;
      campaignDay.impressions += impressions;
      campaignDay.clicks += clicks;
      campaignDay.conversions += conversions;
      byCampaignDay.set(campaignDayKey, campaignDay);
      const daily = byDay.get(dayKey) ?? { date: day, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
      daily.spend += spend;
      daily.revenue += revenue;
      daily.impressions += impressions;
      daily.clicks += clicks;
      daily.conversions += conversions;
      byDay.set(dayKey, daily);
    }
    nextUrl = typeof data?.paging?.next === "string" ? data.paging.next : null;
  }

  for (const campaign of byCampaign.values()) {
    await prisma.salesCampaign.upsert({
      where: { id: `meta-${campaign.id}` },
      create: {
        id: `meta-${campaign.id}`,
        provider: "Meta",
        name: campaign.name,
        spend: money(campaign.spend),
        revenue: money(campaign.revenue),
        impressions: campaign.impressions,
        clicks: campaign.clicks,
        conversions: campaign.conversions,
      },
      update: {
        provider: "Meta",
        name: campaign.name,
        spend: money(campaign.spend),
        revenue: money(campaign.revenue),
        impressions: campaign.impressions,
        clicks: campaign.clicks,
        conversions: campaign.conversions,
      },
    });
  }
  for (const row of byCampaignDay.values()) {
    const campaignId = `meta-${row.campaignId}`;
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
      `${campaignId}-${channelId}-${dateKey(row.date)}`,
      campaignId,
      "Meta",
      row.campaignName,
      channelId,
      row.date,
      money(row.spend),
      money(row.revenue),
      row.impressions,
      row.clicks,
      row.conversions,
      "Meta Ads API",
    );
  }
  const replacedCacheCampaigns = await deleteMatchedCacheCampaigns("Meta", "meta-", Array.from(byCampaign.values()).map((campaign) => campaign.name));
  await refreshSalesDailyMetricsFromCampaignDaily(channelId, Array.from(byDay.values()).map((row) => row.date));
  return { campaigns: byCampaign.size, campaignDailyRows: byCampaignDay.size, dailyRows: byDay.size, replacedCacheCampaigns, from, to, apiVersion: META_GRAPH_API_VERSION };
}

async function syncTikTokAdsCampaigns(account: any, from = "2026-05-22", to = "2026-05-28") {
  const advertiserId = await readConnectionValue(account.id, "tiktok-ads", "advertiserId");
  const accessToken = await readConnectionValue(account.id, "tiktok-ads", "accessToken");
  const channelId = String(account.channelId || "pl").toLowerCase();
  const missing = [
    ["Advertiser ID", advertiserId],
    ["Access token", accessToken],
  ].filter(([, value]) => !String(value).trim()).map(([label]) => label);
  if (missing.length > 0) {
    throw new Error(`Brakuje konfiguracji TikTok Ads: ${missing.join(", ")}`);
  }

  const byCampaign = new Map<string, { id: string; name: string; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>();
  const byCampaignDay = new Map<string, { campaignId: string; campaignName: string; date: Date; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>();
  const byDay = new Map<string, { date: Date; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>();
  let page = 1;
  let totalPage = 1;
  do {
    const url = new URL(`https://business-api.tiktok.com/open_api/${TIKTOK_API_VERSION}/report/integrated/get/`);
    url.searchParams.set("advertiser_id", advertiserId);
    url.searchParams.set("report_type", "BASIC");
    url.searchParams.set("data_level", "AUCTION_CAMPAIGN");
    url.searchParams.set("dimensions", JSON.stringify(["campaign_id", "stat_time_day"]));
    url.searchParams.set("metrics", JSON.stringify(["campaign_name", "spend", "impressions", "clicks", "conversion", "total_purchase_value"]));
    url.searchParams.set("start_date", from);
    url.searchParams.set("end_date", to);
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", "1000");
    const response = await fetch(url.toString(), { headers: { "Access-Token": accessToken } });
    const data = await response.json().catch(() => ({})) as any;
    if (!response.ok || (data?.code !== undefined && Number(data.code) !== 0)) {
      throw new Error(`TikTok Ads report failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
    }
    for (const item of data?.data?.list ?? []) {
      const dimensions = item?.dimensions ?? {};
      const metrics = item?.metrics ?? {};
      const id = String(dimensions.campaign_id || metrics.campaign_id || "");
      if (!id) continue;
      const name = String(metrics.campaign_name || dimensions.campaign_name || `TikTok Ads ${id}`);
      const spend = tiktokNumber(metrics.spend);
      const revenue = tiktokNumber(firstMetricValue(metrics, ["total_purchase_value", "purchase_value", "total_sales", "conversion_value"]));
      const impressions = Math.round(tiktokNumber(metrics.impressions));
      const clicks = Math.round(tiktokNumber(metrics.clicks));
      const conversions = Math.round(tiktokNumber(firstMetricValue(metrics, ["conversion", "conversions", "purchase"])));
      const current = byCampaign.get(id) ?? { id, name, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
      current.spend += spend;
      current.revenue += revenue;
      current.impressions += impressions;
      current.clicks += clicks;
      current.conversions += conversions;
      byCampaign.set(id, current);
      const rawDay = String(dimensions.stat_time_day || metrics.stat_time_day || from).slice(0, 10);
      const day = toUtcDate(rawDay);
      const dayKey = dateKey(day);
      const campaignDayKey = `${id}|${dayKey}`;
      const campaignDay = byCampaignDay.get(campaignDayKey) ?? { campaignId: id, campaignName: name, date: day, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
      campaignDay.spend += spend;
      campaignDay.revenue += revenue;
      campaignDay.impressions += impressions;
      campaignDay.clicks += clicks;
      campaignDay.conversions += conversions;
      byCampaignDay.set(campaignDayKey, campaignDay);
      const daily = byDay.get(dayKey) ?? { date: day, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
      daily.spend += spend;
      daily.revenue += revenue;
      daily.impressions += impressions;
      daily.clicks += clicks;
      daily.conversions += conversions;
      byDay.set(dayKey, daily);
    }
    totalPage = Math.max(1, Number(data?.data?.page_info?.total_page || page));
    page += 1;
  } while (page <= totalPage);

  for (const campaign of byCampaign.values()) {
    await prisma.salesCampaign.upsert({
      where: { id: `tiktok-${campaign.id}` },
      create: {
        id: `tiktok-${campaign.id}`,
        provider: "TikTok",
        name: campaign.name,
        spend: money(campaign.spend),
        revenue: money(campaign.revenue),
        impressions: campaign.impressions,
        clicks: campaign.clicks,
        conversions: campaign.conversions,
      },
      update: {
        provider: "TikTok",
        name: campaign.name,
        spend: money(campaign.spend),
        revenue: money(campaign.revenue),
        impressions: campaign.impressions,
        clicks: campaign.clicks,
        conversions: campaign.conversions,
      },
    });
  }
  for (const row of byCampaignDay.values()) {
    const campaignId = `tiktok-${row.campaignId}`;
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
      `${campaignId}-${channelId}-${dateKey(row.date)}`,
      campaignId,
      "TikTok",
      row.campaignName,
      channelId,
      row.date,
      money(row.spend),
      money(row.revenue),
      row.impressions,
      row.clicks,
      row.conversions,
      "TikTok Ads API",
    );
  }
  const replacedCacheCampaigns = await deleteMatchedCacheCampaigns("TikTok", "tiktok-", Array.from(byCampaign.values()).map((campaign) => campaign.name));
  await refreshSalesDailyMetricsFromCampaignDaily(channelId, Array.from(byDay.values()).map((row) => row.date));
  return { campaigns: byCampaign.size, campaignDailyRows: byCampaignDay.size, dailyRows: byDay.size, replacedCacheCampaigns, from, to, apiVersion: TIKTOK_API_VERSION };
}

async function listIntegrations() {
  await ensureDemoIntegrations();
  await reconcileComposioAccounts();
  const [channels, accounts] = await Promise.all([
    prisma.salesChannel.findMany({ orderBy: { id: "asc" } }),
    prisma.integrationAccount.findMany({
      where: { organizationId: ORGANIZATION_ID },
      include: { configs: true, secrets: true, mappings: true },
      orderBy: [{ channelId: "asc" }, { provider: "asc" }],
    }),
  ]);

  const items = PROVIDERS.map((provider) => {
    const providerAccounts = accounts.filter((account) => account.provider === provider.code);
    const account = providerAccounts[0] ?? null;
    return {
      provider,
      account: publicAccount(account),
      accounts: providerAccounts.map(publicAccount),
      readiness: readinessFor(provider, account),
      credentialState: provider.authType === "manual" ? "not-required" : account?.status === "CONNECTED" ? "stored" : "missing",
      counts: {
        configs: providerAccounts.reduce((total, item) => total + item.configs.length, 0),
        secrets: providerAccounts.reduce((total, item) => total + item.secrets.length, 0),
        mappings: providerAccounts.reduce((total, item) => total + item.mappings.length, 0),
      },
    };
  });

  return {
    organizationId: ORGANIZATION_ID,
    channels: channels.map((channel) => ({
      ...channel,
      integrations: sortAccounts(accounts.filter((account) => account.channelId === channel.id)).map(publicAccount),
    })),
    items,
    total: PROVIDERS.length,
    connected: accounts.filter((account) => account.status === "CONNECTED").length,
    connectionLimit: 12,
  };
}

async function getOne(providerCode: string) {
  await ensureDemoIntegrations();
  const provider = PROVIDERS.find((item) => item.code === providerCode);
  if (!provider) return null;
  const [accounts, logs] = await Promise.all([
    prisma.integrationAccount.findMany({
      where: { organizationId: ORGANIZATION_ID, provider: providerCode },
      include: { configs: true, secrets: true, mappings: true },
      orderBy: [{ channelId: "asc" }],
    }),
    prisma.integrationLog.findMany({ where: { organizationId: ORGANIZATION_ID, provider: providerCode }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return {
    provider,
    accounts: accounts.map(publicAccount),
    account: publicAccount(accounts[0] ?? null),
    readiness: readinessFor(provider, accounts[0] ?? null),
    logs: logs.map(publicLog),
  };
}

integrationsRouter.get("/providers", (_req, res) => {
  res.json(PROVIDERS);
});

integrationsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await listIntegrations());
  } catch (error) {
    next(error);
  }
});

integrationsRouter.get("/logs", async (_req, res, next) => {
  try {
    const logs = await prisma.integrationLog.findMany({ where: { organizationId: ORGANIZATION_ID }, orderBy: { createdAt: "desc" }, take: 50 });
    res.json({ items: logs.map(publicLog) });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.get("/composio/callback", async (req, res, next) => {
  try {
    const providerCode = typeof req.query.provider === "string" ? req.query.provider : "";
    const channelId = typeof req.query.channelId === "string" ? req.query.channelId.toLowerCase() : "pl";
    const provider = PROVIDERS.find((item) => item.code === providerCode);
    if (!provider) {
      res.status(400).send("Nieznany provider integracji Composio.");
      return;
    }
    const connectedAccountId =
      (typeof req.query.connectedAccountId === "string" && req.query.connectedAccountId) ||
      (typeof req.query.connected_account_id === "string" && req.query.connected_account_id) ||
      (typeof req.query.id === "string" && req.query.id) ||
      "";
    const status = String(req.query.status || (connectedAccountId ? "CONNECTED" : "ERROR")).toUpperCase();
    const externalAccountName =
      (typeof req.query.connectedAccountName === "string" && req.query.connectedAccountName) ||
      (typeof req.query.accountName === "string" && req.query.accountName) ||
      `${provider.name} ${channelId.toUpperCase()}`;
    const isConnected = Boolean(connectedAccountId) && status !== "ERROR" && status !== "FAILED";
    const metadata = {
      source: "composio",
      authMode: "composio",
      channelId,
      composioUserId: getComposioUserId(),
      composioConnectedAccountId: connectedAccountId || null,
      callbackQuery: req.query,
    };
    const existing = await prisma.integrationAccount.findFirst({ where: { organizationId: ORGANIZATION_ID, provider: provider.code, channelId } });
    const account = existing
      ? await prisma.integrationAccount.update({
          where: { id: existing.id },
          data: {
            status: isConnected ? "CONNECTED" : "ERROR",
            externalAccountId: connectedAccountId || null,
            externalAccountType: "composio",
            externalAccountName,
            scopesJson: json(provider.defaultScopes),
            metadataJson: json(metadata),
            lastErrorCode: isConnected ? null : "COMPOSIO_CALLBACK_MISSING_ACCOUNT",
            lastErrorMessage: isConnected ? null : "Composio nie zwróciło identyfikatora połączonego konta.",
          },
        })
      : await prisma.integrationAccount.create({
          data: {
            organizationId: ORGANIZATION_ID,
            provider: provider.code,
            name: provider.name,
            status: isConnected ? "CONNECTED" : "ERROR",
            channelId,
            externalAccountId: connectedAccountId || null,
            externalAccountType: "composio",
            externalAccountName,
            scopesJson: json(provider.defaultScopes),
            settingsJson: json({ syncOptions: provider.syncOptions.filter((item) => item.defaultEnabled).map((item) => item.key) }),
            metadataJson: json(metadata),
            lastErrorCode: isConnected ? null : "COMPOSIO_CALLBACK_MISSING_ACCOUNT",
            lastErrorMessage: isConnected ? null : "Composio nie zwróciło identyfikatora połączonego konta.",
          },
        });
    await prisma.integrationLog.create({
      data: {
        organizationId: ORGANIZATION_ID,
        provider: provider.code,
        operation: "integration.composio.callback",
        status: isConnected ? "CONNECTED" : "ERROR",
        requestPayloadJson: json({ channelId, accountId: account.id, query: req.query }),
        errorMessage: isConnected ? null : "Brak connected account id w callbacku Composio",
      },
    });
    const webUrl = new URL(process.env.WEB_APP_URL || "http://localhost:5175/");
    webUrl.searchParams.set("view", "integrations");
    webUrl.searchParams.set("provider", provider.code);
    webUrl.searchParams.set("connected", isConnected ? "success" : "error");
    res.redirect(webUrl.toString());
  } catch (error) {
    next(error);
  }
});

integrationsRouter.get("/google/callback", async (req, res, next) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? decodeState(req.query.state) : null;
    if (!code || !state) {
      res.status(400).send("Brakuje kodu lub state w callbacku Google.");
      return;
    }
    const provider = PROVIDERS.find((item) => item.code === state.provider);
    if (!provider || !GOOGLE_OAUTH_SCOPES[provider.code]) {
      res.status(400).send("Nieznany provider Google OAuth.");
      return;
    }
    const channelId = state.channelId.toLowerCase();
    const tokens = await exchangeGoogleCode(code);
    const email = await getGoogleUserEmail(tokens.access_token);
    const existing = await prisma.integrationAccount.findFirst({ where: { organizationId: ORGANIZATION_ID, provider: provider.code, channelId } });
    const account = existing
      ? await prisma.integrationAccount.update({
          where: { id: existing.id },
          data: {
            name: provider.name,
            status: "CONNECTED",
            externalAccountType: "google-oauth",
            externalAccountName: email || `${provider.name} ${channelId.toUpperCase()}`,
            scopesJson: json((tokens.scope || GOOGLE_OAUTH_SCOPES[provider.code].join(" ")).split(" ").filter(Boolean)),
            settingsJson: json({ syncOptions: provider.syncOptions.filter((item) => item.defaultEnabled).map((item) => item.key) }),
            metadataJson: json({ source: "google-oauth", channelId, email }),
            tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
            lastTestAt: new Date(),
            lastErrorCode: tokens.refresh_token ? null : "GOOGLE_REFRESH_TOKEN_MISSING",
            lastErrorMessage: tokens.refresh_token ? null : "Google nie zwrócił refresh tokena. Cofnij dostęp aplikacji w Google i zaloguj ponownie.",
          },
        })
      : await prisma.integrationAccount.create({
          data: {
            organizationId: ORGANIZATION_ID,
            provider: provider.code,
            name: provider.name,
            status: "CONNECTED",
            channelId,
            externalAccountType: "google-oauth",
            externalAccountName: email || `${provider.name} ${channelId.toUpperCase()}`,
            scopesJson: json((tokens.scope || GOOGLE_OAUTH_SCOPES[provider.code].join(" ")).split(" ").filter(Boolean)),
            settingsJson: json({ syncOptions: provider.syncOptions.filter((item) => item.defaultEnabled).map((item) => item.key) }),
            metadataJson: json({ source: "google-oauth", channelId, email }),
            tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
            lastTestAt: new Date(),
            lastErrorCode: tokens.refresh_token ? null : "GOOGLE_REFRESH_TOKEN_MISSING",
            lastErrorMessage: tokens.refresh_token ? null : "Google nie zwrócił refresh tokena. Cofnij dostęp aplikacji w Google i zaloguj ponownie.",
          },
        });
    await prisma.integrationSecret.upsert({
      where: { organizationId_provider_secretType_key: { organizationId: ORGANIZATION_ID, provider: provider.code, secretType: "access_token", key: "accessToken" } },
      update: { integrationAccountId: account.id, status: "ACTIVE", secretRef: tokens.access_token, maskedValue: maskSecret(tokens.access_token), fingerprint: fingerprint(tokens.access_token), lastRotatedAt: new Date() },
      create: { organizationId: ORGANIZATION_ID, integrationAccountId: account.id, provider: provider.code, secretType: "access_token", key: "accessToken", status: "ACTIVE", secretRef: tokens.access_token, maskedValue: maskSecret(tokens.access_token), fingerprint: fingerprint(tokens.access_token), lastRotatedAt: new Date() },
    });
    if (tokens.refresh_token) {
      await prisma.integrationSecret.upsert({
        where: { organizationId_provider_secretType_key: { organizationId: ORGANIZATION_ID, provider: provider.code, secretType: "refresh_token", key: "refreshToken" } },
        update: { integrationAccountId: account.id, status: "ACTIVE", secretRef: tokens.refresh_token, maskedValue: maskSecret(tokens.refresh_token), fingerprint: fingerprint(tokens.refresh_token), lastRotatedAt: new Date() },
        create: { organizationId: ORGANIZATION_ID, integrationAccountId: account.id, provider: provider.code, secretType: "refresh_token", key: "refreshToken", status: "ACTIVE", secretRef: tokens.refresh_token, maskedValue: maskSecret(tokens.refresh_token), fingerprint: fingerprint(tokens.refresh_token), lastRotatedAt: new Date() },
      });
    }
    await prisma.integrationLog.create({
      data: {
        organizationId: ORGANIZATION_ID,
        provider: provider.code,
        operation: "integration.google.callback",
        status: tokens.refresh_token ? "CONNECTED" : "CONNECTED_WITH_WARNING",
        requestPayloadJson: json({ channelId, email, scopes: tokens.scope }),
        errorMessage: tokens.refresh_token ? null : "Google OAuth nie zwrócił refresh tokena.",
      },
    });
    const webUrl = new URL(process.env.WEB_APP_URL || "http://localhost:6670/");
    webUrl.searchParams.set("view", "integrations");
    webUrl.searchParams.set("provider", provider.code);
    webUrl.searchParams.set("connected", "google");
    res.redirect(webUrl.toString());
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post("/:provider/google/connect-link", async (req, res, next) => {
  try {
    const provider = PROVIDERS.find((item) => item.code === req.params.provider);
    if (!provider || !GOOGLE_OAUTH_SCOPES[provider.code]) {
      res.status(400).json({ error: "Ta integracja nie obsługuje natywnego logowania Google." });
      return;
    }
    const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.toLowerCase() : "pl";
    const redirectUrl = googleOAuthUrl(provider, channelId);
    await prisma.integrationLog.create({
      data: {
        organizationId: ORGANIZATION_ID,
        provider: provider.code,
        operation: "integration.google.connect_link",
        status: "PENDING",
        requestPayloadJson: json({ channelId, scopes: GOOGLE_OAUTH_SCOPES[provider.code] }),
      },
    });
    res.json({ provider: provider.code, channelId, redirectUrl });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post("/:provider/composio/connect-link", async (req, res, next) => {
  try {
    const provider = PROVIDERS.find((item) => item.code === req.params.provider);
    if (!provider) {
      res.status(404).json({ error: "Integration provider not found" });
      return;
    }
    if (!provider.composioToolkit) {
      res.status(400).json({ error: "Ta integracja nie ma trybu Composio." });
      return;
    }
    const apiKey = getComposioApiKey();
    if (!apiKey) {
      res.status(400).json({ error: "Brak COMPOSIO_API_KEY w apps/api/.env." });
      return;
    }
    const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.toLowerCase() : "pl";
    const authConfigId = await resolveComposioAuthConfigId(apiKey, provider.composioToolkit, getComposioAuthConfigOverride(provider.code));
    const redirectUrl = await createComposioConnectLink(apiKey, authConfigId, getComposioUserId(), getComposioCallbackUrl(provider, channelId));
    await prisma.integrationLog.create({
      data: {
        organizationId: ORGANIZATION_ID,
        provider: provider.code,
        operation: "integration.composio.connect_link",
        status: "PENDING",
        requestPayloadJson: json({ channelId, toolkit: provider.composioToolkit, authConfigId }),
      },
    });
    res.json({ provider: provider.code, channelId, toolkitSlug: provider.composioToolkit, composioUserId: getComposioUserId(), redirectUrl });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post("/:provider/composio/refresh", async (req, res, next) => {
  try {
    const provider = PROVIDERS.find((item) => item.code === req.params.provider);
    if (!provider) {
      res.status(404).json({ error: "Integration provider not found" });
      return;
    }
    await reconcileComposioAccounts();
    res.json(await getOne(provider.code));
  } catch (error) {
    next(error);
  }
});

integrationsRouter.get("/:provider", async (req, res, next) => {
  try {
    const data = await getOne(req.params.provider);
    if (!data) {
      res.status(404).json({ error: "Integration provider not found" });
      return;
    }
    res.json(data);
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post("/:provider/connect", async (req, res, next) => {
  try {
    const provider = PROVIDERS.find((item) => item.code === req.params.provider);
    if (!provider) {
      res.status(404).json({ error: "Integration provider not found" });
      return;
    }
    const body = req.body ?? {};
    const channelId = typeof body.channelId === "string" ? body.channelId.toLowerCase() : "pl";
    const displayName = typeof body.displayName === "string" && body.displayName ? body.displayName : provider.name;
    const missing = missingRequiredFields(provider, body);
    if (missing.length > 0) {
      res.status(400).json({ error: `Uzupełnij wymagane pola: ${missing.join(", ")}` });
      return;
    }
    const existing = await prisma.integrationAccount.findFirst({ where: { organizationId: ORGANIZATION_ID, provider: provider.code, channelId } });
    const account = existing
      ? await prisma.integrationAccount.update({
          where: { id: existing.id },
          data: {
            name: displayName,
            status: "CONNECTED",
            externalAccountType: provider.authType,
            externalAccountName: `${displayName} ${channelId.toUpperCase()}`,
            scopesJson: json(provider.defaultScopes),
            settingsJson: json({ syncOptions: body.syncOptions ?? provider.syncOptions.filter((item) => item.defaultEnabled).map((item) => item.key) }),
            metadataJson: json({ source: "manual-config", channelId }),
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        })
      : await prisma.integrationAccount.create({
          data: {
            organizationId: ORGANIZATION_ID,
            provider: provider.code,
            name: displayName,
            status: "CONNECTED",
            channelId,
            externalAccountType: provider.authType,
            externalAccountName: `${displayName} ${channelId.toUpperCase()}`,
            scopesJson: json(provider.defaultScopes),
            settingsJson: json({ syncOptions: body.syncOptions ?? provider.syncOptions.filter((item) => item.defaultEnabled).map((item) => item.key) }),
            metadataJson: json({ source: "manual-config", channelId }),
          },
        });

    for (const [key, value] of Object.entries(body)) {
      if (["displayName", "channelId", "syncOptions"].includes(key) || value === undefined || value === "") continue;
      if (SECRET_FIELDS.has(key)) {
        const secret = String(value);
        await prisma.integrationSecret.upsert({
          where: { organizationId_provider_secretType_key: { organizationId: ORGANIZATION_ID, provider: provider.code, secretType: key.includes("refresh") ? "refresh_token" : "access_token", key } },
          update: { integrationAccountId: account.id, status: "ACTIVE", secretRef: secret, maskedValue: maskSecret(secret), fingerprint: fingerprint(secret), lastRotatedAt: new Date() },
          create: { organizationId: ORGANIZATION_ID, integrationAccountId: account.id, provider: provider.code, secretType: key.includes("refresh") ? "refresh_token" : "access_token", key, status: "ACTIVE", secretRef: secret, maskedValue: maskSecret(secret), fingerprint: fingerprint(secret), lastRotatedAt: new Date() },
        });
      } else {
        await prisma.integrationConfig.upsert({
          where: { organizationId_provider_configType_key: { organizationId: ORGANIZATION_ID, provider: provider.code, configType: "connection", key } },
          update: { integrationAccountId: account.id, valueJson: json(value), rawPayloadJson: json({ updatedFrom: "integrations-v2-compatible" }) },
          create: { organizationId: ORGANIZATION_ID, integrationAccountId: account.id, provider: provider.code, configType: "connection", key, valueJson: json(value), rawPayloadJson: json({ updatedFrom: "integrations-v2-compatible" }) },
        });
      }
    }

    await prisma.integrationLog.create({
      data: {
        organizationId: ORGANIZATION_ID,
        provider: provider.code,
        operation: "integration.connect",
        status: "CONFIGURED",
        requestPayloadJson: json({ channelId, configKeys: Object.keys(body).filter((key) => !SECRET_FIELDS.has(key)), secretKeys: Object.keys(body).filter((key) => SECRET_FIELDS.has(key)) }),
      },
    });
    res.json(await getOne(provider.code));
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post("/:provider/test", async (req, res, next) => {
  try {
    const provider = PROVIDERS.find((item) => item.code === req.params.provider);
    const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.toLowerCase() : undefined;
    const account = await prisma.integrationAccount.findFirst({ where: { organizationId: ORGANIZATION_ID, provider: req.params.provider, ...(channelId ? { channelId } : {}) } });
    let ok = Boolean(account?.status === "CONNECTED");
    let diagnostic: unknown = null;
    let errorMessage: string | null = ok ? null : "Brak aktywnej integracji";
    if (ok && req.params.provider === "google-ads" && account?.externalAccountType === "composio") {
      try {
        diagnostic = await validateComposioGoogleAdsAccount(account);
      } catch (error) {
        ok = false;
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    }
    await prisma.integrationAccount.updateMany({
      where: { organizationId: ORGANIZATION_ID, provider: req.params.provider, ...(channelId ? { channelId } : {}) },
      data: { lastTestAt: new Date(), lastErrorCode: ok ? null : "TEST_FAILED", lastErrorMessage: ok ? null : errorMessage },
    });
    await prisma.integrationLog.create({
      data: {
        organizationId: ORGANIZATION_ID,
        provider: req.params.provider,
        operation: "integration.test",
        status: ok ? "SUCCESS" : "ERROR",
        errorMessage: ok ? null : errorMessage,
        requestPayloadJson: json({ channelId }),
        responsePayloadJson: json({ ok, dryRun: false, provider: provider?.name ?? req.params.provider, channelId, diagnostic }),
      },
    });
    res.json({ ok, status: ok ? "SUCCESS" : "ERROR", message: ok ? `Połączenie ${provider?.name ?? req.params.provider} ${channelId?.toUpperCase() ?? ""} jest aktywne.` : errorMessage });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post("/:provider/sync", async (req, res, next) => {
  try {
    const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.toLowerCase() : undefined;
    const account = await prisma.integrationAccount.findFirst({ where: { organizationId: ORGANIZATION_ID, provider: req.params.provider, ...(channelId ? { channelId } : {}) } });
    const ok = Boolean(account?.status === "CONNECTED");
    const syncType = typeof req.body?.syncType === "string" ? req.body.syncType : "full";
    let imported: Record<string, unknown> | null = null;
    if (ok && req.params.provider === "google-ads" && account) {
      const from = typeof req.body?.from === "string" ? req.body.from : "2026-05-22";
      const to = typeof req.body?.to === "string" ? req.body.to : "2026-05-28";
      imported = await syncGoogleAdsCampaigns(account, from, to);
    } else if (ok && req.params.provider === "google-analytics" && account) {
      const from = typeof req.body?.from === "string" ? req.body.from : "2026-05-22";
      const to = typeof req.body?.to === "string" ? req.body.to : "2026-05-28";
      imported = await syncGoogleAnalyticsTraffic(account, from, to);
    } else if (ok && req.params.provider === "meta-ads" && account) {
      const from = typeof req.body?.from === "string" ? req.body.from : "2026-05-22";
      const to = typeof req.body?.to === "string" ? req.body.to : "2026-05-28";
      imported = await syncMetaAdsCampaigns(account, from, to);
    } else if (ok && req.params.provider === "tiktok-ads" && account) {
      const from = typeof req.body?.from === "string" ? req.body.from : "2026-05-22";
      const to = typeof req.body?.to === "string" ? req.body.to : "2026-05-28";
      imported = await syncTikTokAdsCampaigns(account, from, to);
    } else if (ok) {
      imported = { orders: 1023, products: 365, campaigns: 24 };
    }
    if (ok) {
      await prisma.integrationAccount.updateMany({ where: { organizationId: ORGANIZATION_ID, provider: req.params.provider, ...(channelId ? { channelId } : {}) }, data: { lastSyncAt: new Date(), lastErrorCode: null, lastErrorMessage: null } });
    }
    await prisma.integrationLog.create({
      data: {
        organizationId: ORGANIZATION_ID,
        provider: req.params.provider,
        operation: "integration.sync",
        status: ok ? "SUCCESS" : "BLOCKED",
        errorMessage: ok ? null : "Synchronizacja zablokowana, integracja nieaktywna",
        requestPayloadJson: json({ syncType, channelId }),
        responsePayloadJson: json({ ok, channelId, imported }),
      },
    });
    res.json({ ok, status: ok ? "SUCCESS" : "BLOCKED", message: ok ? `Synchronizacja ${channelId?.toUpperCase() ?? ""} zakończona.` : "Integracja nieaktywna.", imported });
  } catch (error) {
    const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.toLowerCase() : undefined;
    const syncType = typeof req.body?.syncType === "string" ? req.body.syncType : "full";
    const message = error instanceof Error ? error.message : String(error);
    await prisma.integrationAccount.updateMany({
      where: { organizationId: ORGANIZATION_ID, provider: req.params.provider, ...(channelId ? { channelId } : {}) },
      data: { lastErrorCode: "SYNC_FAILED", lastErrorMessage: message },
    });
    await prisma.integrationLog.create({
      data: {
        organizationId: ORGANIZATION_ID,
        provider: req.params.provider,
        operation: "integration.sync",
        status: "ERROR",
        errorMessage: message,
        requestPayloadJson: json({ syncType, channelId }),
        responsePayloadJson: json({ ok: false, channelId }),
      },
    });
    next(error);
  }
});

integrationsRouter.post("/:provider/discover-property", async (req, res, next) => {
  try {
    if (req.params.provider !== "google-analytics") {
      res.status(400).json({ error: "Automatyczne wykrywanie Property ID jest dostępne tylko dla Google Analytics." });
      return;
    }
    const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.toLowerCase() : undefined;
    const account = await prisma.integrationAccount.findFirst({ where: { organizationId: ORGANIZATION_ID, provider: "google-analytics", ...(channelId ? { channelId } : {}) } });
    if (!account || account.status !== "CONNECTED") {
      res.status(400).json({ error: "Najpierw połącz Google Analytics przez Google OAuth albo service account." });
      return;
    }
    const candidates = await discoverGoogleAnalyticsProperties(account);
    let selected: Awaited<ReturnType<typeof ensureGoogleAnalyticsPropertyId>> | null = null;
    if (candidates.length === 1) {
      selected = await ensureGoogleAnalyticsPropertyId(account);
    }
    await prisma.integrationLog.create({
      data: {
        organizationId: ORGANIZATION_ID,
        provider: "google-analytics",
        operation: "integration.ga4.discover_property",
        status: selected?.propertyId ? "SUCCESS" : "NEEDS_SELECTION",
        requestPayloadJson: json({ channelId }),
        responsePayloadJson: json({ candidates, selectedPropertyId: selected?.propertyId ?? null }),
      },
    });
    res.json({
      ok: Boolean(selected?.propertyId),
      selectedPropertyId: selected?.propertyId ?? null,
      candidates,
      message: selected?.propertyId
        ? `Zapisano GA4 Property ID ${selected.propertyId}.`
        : "Znaleziono kilka właściwości GA4. Wybierz Property ID w konfiguracji integracji.",
    });
  } catch (error) {
    const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.toLowerCase() : undefined;
    const message = error instanceof Error ? error.message : String(error);
    await prisma.integrationLog.create({
      data: {
        organizationId: ORGANIZATION_ID,
        provider: "google-analytics",
        operation: "integration.ga4.discover_property",
        status: "ERROR",
        errorMessage: message,
        requestPayloadJson: json({ channelId }),
      },
    });
    next(error);
  }
});

integrationsRouter.post("/:provider/disconnect", async (req, res, next) => {
  try {
    const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.toLowerCase() : undefined;
    await prisma.integrationAccount.updateMany({
      where: { organizationId: ORGANIZATION_ID, provider: req.params.provider, ...(channelId ? { channelId } : {}) },
      data: { status: "DISCONNECTED", lastErrorCode: null, lastErrorMessage: null },
    });
    await prisma.integrationLog.create({
      data: {
        organizationId: ORGANIZATION_ID,
        provider: req.params.provider,
        operation: "integration.disconnect",
        status: "DISCONNECTED",
        requestPayloadJson: json({ channelId }),
      },
    });
    res.json(await getOne(req.params.provider));
  } catch (error) {
    next(error);
  }
});
