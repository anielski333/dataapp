export type SummaryResponse = {
  filters: { channels: string[]; currency: string };
  kpis: Record<string, number | null>;
  changes: Record<string, number>;
  timeSeries: Array<{ date: string; revenueNet: number; totalCost: number; orders: number; margin: number }>;
  funnel: Array<{ step: string; value: number; rate: number; change: number }>;
  topProducts: Product[];
  adSources: Campaign[];
  customerSegments: {
    new: { customers: number; revenue: number; aov: number; change: number };
    returning: { customers: number; revenue: number; aov: number; change: number };
  };
};

export type TrafficResponse = {
  integrationStatus: "CONNECTED" | "ERROR" | "NEEDS_CONFIGURATION";
  propertyId: string | null;
  propertyName: string | null;
  organizationId: string;
  kpis: Record<string, number>;
  changes: Record<string, number>;
  timeSeries: Array<{ date: string; [key: string]: number | string }>;
  funnel: Array<{ step: string; value: number; rate: number; change: number }>;
  topProducts: Array<{ itemId: string; itemName: string; views: number; addToCart: number; purchases: number; itemRevenue: number }>;
  topSources: Array<{ source: string; medium: string; sessions: number; transactions: number; purchaseRevenue: number }>;
  events: Array<{ eventName: string; eventCount: number; totalUsers: number }>;
};

export type IntegrationAccount = {
  id: string;
  provider: string;
  name: string;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR" | string;
  channelId?: string | null;
  externalAccountName?: string | null;
  tokenMasked?: string;
  lastTestAt?: string | null;
  lastSyncAt?: string | null;
  lastErrorMessage?: string | null;
};

export type SalesChannelInfo = {
  id: string;
  name: string;
  market: string;
  currency: string;
};

export type IntegrationChannel = SalesChannelInfo & {
  integrations: IntegrationAccount[];
};

export type IntegrationProviderConfig = {
  code: string;
  name: string;
  category: string;
  authType: string;
  fields?: Array<{
    name: string;
    label: string;
    type: "text" | "password" | "url" | "select";
    required?: boolean;
    secret?: boolean;
    placeholder?: string;
    options?: string[];
  }>;
  composioToolkit?: string;
};

export type IntegrationOverview = {
  channels: IntegrationChannel[];
  connected: number;
  connectionLimit: number;
  items: Array<{ provider: IntegrationProviderConfig; status: string; account?: IntegrationAccount | null }>;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  channelId: string;
  revenueNet: number;
  unitsSold: number;
  conversion: number;
  margin: number;
  price: number;
  productCost: number;
  changePct: number;
};

export type Campaign = {
  id: string;
  provider: string;
  name: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

export type MarketingCampaign = {
  provider: string;
  campaignName: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
  ctr: number;
  cpc: number;
  cpa: number;
  channelId: string;
  date: string;
};

export type MarketingData = {
  dataQuality: Record<string, any>;
  comparison?: { currentLabel: string; previousLabel: string };
  dateCoverage?: any;
  googleAds?: any;
  totals?: Record<string, number>;
  metricChanges?: Record<string, number>;
  channelBreakdown?: any[];
  providerSummary?: any[];
  campaignDaily?: any[];
  campaignDailyRows?: any[];
  reconciliation?: any;
  campaignScope?: any;
  campaignSourceSummary?: any;
  nextImportActions?: any[];
  missingConfiguration?: any[];
  dataSources?: any[];
  recentOperations?: any[];
  diagnostics?: any[];
  traffic?: any;
};

export type MarketingImportDraft = {
  provider: string;
  rawCsv: string;
  preview?: MarketingImportPreview;
};

export type MarketingNextImportAction = {
  provider: string;
  type: string;
  label: string;
  description: string;
  channelId?: string;
};

export type CampaignImportResponse = {
  stats: { rows: number; periods: number; campaigns: number; providers: string[] };
  quality: string[];
  summary: { spend: number; revenue: number; impressions: number; clicks: number; conversions: number };
};

export type TrafficImportResponse = {
  stats: { rows: number; periods: number };
  quality: string[];
  summary: { sessions: number; transactions: number; revenue: number };
};

export type EventImportResponse = {
  stats: { rows: number; periods: number; events: number };
  quality: string[];
  summary: { eventCount: number; totalUsers: number };
};

export type DailyImportResponse = {
  stats: { rows: number; periods: number };
  quality: string[];
  dailyImpact: { rows: number; periodsCovered: number };
  summary: { spend: number; revenue: number; impressions: number; clicks: number; conversions: number };
};

export type AdsSyncResponse = {
  status: string;
  message: string;
  importedCampaigns: number;
  replacedCache: string | null;
};

export type AnalyticsSyncResponse = {
  status: string;
  message: string;
  import: { propertyId: string; channelId: string };
};

export type MarketingImportPreview = {
  provider: string;
  rows: number;
  periods: string;
  summary: {
    spend: number;
    revenue: number;
    impressions: number;
    clicks: number;
    conversions: number;
  };
  events?: {
    eventCount: number;
    totalUsers: number;
  };
  replacementImpact?: {
    campaignsReplaced: number;
    rowsReplaced: number;
  };
  traffic?: {
    sessions: number;
    transactions: number;
    revenue: number;
  };
  dailyImpact?: {
    rows: number;
    periodsCovered: number;
  };
};

export type View = "summary" | "orders" | "products" | "customers" | "marketing" | "traffic" | "integrations" | "settings";

export type NavItem = {
  view: View;
  icon: string;
  label: string;
};
