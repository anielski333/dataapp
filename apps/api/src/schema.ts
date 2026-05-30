import { prisma } from "./db.js";

export async function ensureSchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SalesChannel" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "market" TEXT NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'PLN',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SalesDailyMetric" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "channelId" TEXT NOT NULL,
      "date" DATETIME NOT NULL,
      "revenueNet" REAL NOT NULL,
      "totalCost" REAL NOT NULL,
      "productCost" REAL NOT NULL,
      "mediaCost" REAL NOT NULL,
      "additionalCost" REAL NOT NULL,
      "marketplaceCost" REAL NOT NULL,
      "discounts" REAL NOT NULL,
      "orders" INTEGER NOT NULL,
      "unitsSold" INTEGER NOT NULL,
      "newCustomers" INTEGER NOT NULL,
      "returningCustomers" INTEGER NOT NULL,
      "sessions" INTEGER NOT NULL,
      "productViews" INTEGER NOT NULL,
      "addToCart" INTEGER NOT NULL,
      "checkoutStarted" INTEGER NOT NULL,
      "transactions" INTEGER NOT NULL,
      "impressions" INTEGER NOT NULL,
      "clicks" INTEGER NOT NULL,
      "adConversions" INTEGER NOT NULL,
      CONSTRAINT "SalesDailyMetric_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SalesChannel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "SalesDailyMetric_channelId_date_key" ON "SalesDailyMetric"("channelId", "date");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SalesDailyMetric_date_idx" ON "SalesDailyMetric"("date");`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TrafficDailyMetric" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "channelId" TEXT,
      "integrationAccountId" TEXT,
      "propertyId" TEXT NOT NULL,
      "date" DATETIME NOT NULL,
      "totalUsers" INTEGER NOT NULL DEFAULT 0,
      "activeUsers" INTEGER NOT NULL DEFAULT 0,
      "sessions" INTEGER NOT NULL DEFAULT 0,
      "engagedSessions" INTEGER NOT NULL DEFAULT 0,
      "views" INTEGER NOT NULL DEFAULT 0,
      "productViews" INTEGER NOT NULL DEFAULT 0,
      "addToCart" INTEGER NOT NULL DEFAULT 0,
      "checkoutStarted" INTEGER NOT NULL DEFAULT 0,
      "transactions" INTEGER NOT NULL DEFAULT 0,
      "purchaseRevenue" REAL NOT NULL DEFAULT 0,
      "currency" TEXT NOT NULL DEFAULT 'PLN',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TrafficDailyMetric_organizationId_channelId_propertyId_date_key" ON "TrafficDailyMetric"("organizationId", "channelId", "propertyId", "date");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrafficDailyMetric_organizationId_date_idx" ON "TrafficDailyMetric"("organizationId", "date");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrafficDailyMetric_integrationAccountId_idx" ON "TrafficDailyMetric"("integrationAccountId");`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TrafficAttributionMetric" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "channelId" TEXT,
      "integrationAccountId" TEXT,
      "propertyId" TEXT NOT NULL,
      "date" DATETIME NOT NULL,
      "source" TEXT NOT NULL,
      "medium" TEXT NOT NULL,
      "campaign" TEXT NOT NULL,
      "sessions" INTEGER NOT NULL DEFAULT 0,
      "views" INTEGER NOT NULL DEFAULT 0,
      "transactions" INTEGER NOT NULL DEFAULT 0,
      "purchaseRevenue" REAL NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TrafficAttributionMetric_organizationId_channelId_propertyId_date_source_medium_campaign_key" ON "TrafficAttributionMetric"("organizationId", "channelId", "propertyId", "date", "source", "medium", "campaign");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrafficAttributionMetric_organizationId_date_idx" ON "TrafficAttributionMetric"("organizationId", "date");`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TrafficEventMetric" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "channelId" TEXT,
      "integrationAccountId" TEXT,
      "propertyId" TEXT NOT NULL,
      "date" DATETIME NOT NULL,
      "eventName" TEXT NOT NULL,
      "eventCount" INTEGER NOT NULL DEFAULT 0,
      "totalUsers" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TrafficEventMetric_organizationId_channelId_propertyId_date_eventName_key" ON "TrafficEventMetric"("organizationId", "channelId", "propertyId", "date", "eventName");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrafficEventMetric_organizationId_date_idx" ON "TrafficEventMetric"("organizationId", "date");`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TrafficProductMetric" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "channelId" TEXT,
      "integrationAccountId" TEXT,
      "propertyId" TEXT NOT NULL,
      "date" DATETIME NOT NULL,
      "itemId" TEXT NOT NULL,
      "itemName" TEXT NOT NULL,
      "views" INTEGER NOT NULL DEFAULT 0,
      "addToCart" INTEGER NOT NULL DEFAULT 0,
      "purchases" INTEGER NOT NULL DEFAULT 0,
      "itemRevenue" REAL NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TrafficProductMetric_organizationId_channelId_propertyId_date_itemId_key" ON "TrafficProductMetric"("organizationId", "channelId", "propertyId", "date", "itemId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrafficProductMetric_organizationId_date_idx" ON "TrafficProductMetric"("organizationId", "date");`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SalesProduct" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "sku" TEXT NOT NULL,
      "channelId" TEXT NOT NULL,
      "revenueNet" REAL NOT NULL,
      "unitsSold" INTEGER NOT NULL,
      "conversion" REAL NOT NULL,
      "margin" REAL NOT NULL,
      "price" REAL NOT NULL,
      "productCost" REAL NOT NULL,
      "changePct" REAL NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SalesCampaign" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "provider" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "spend" REAL NOT NULL,
      "revenue" REAL NOT NULL,
      "impressions" INTEGER NOT NULL,
      "clicks" INTEGER NOT NULL,
      "conversions" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SalesCampaignDailyMetric" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "campaignId" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "campaignName" TEXT NOT NULL,
      "channelId" TEXT NOT NULL,
      "date" DATETIME NOT NULL,
      "spend" REAL NOT NULL DEFAULT 0,
      "revenue" REAL NOT NULL DEFAULT 0,
      "impressions" INTEGER NOT NULL DEFAULT 0,
      "clicks" INTEGER NOT NULL DEFAULT 0,
      "conversions" INTEGER NOT NULL DEFAULT 0,
      "source" TEXT NOT NULL DEFAULT 'CSV/import',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SalesCampaignDailyMetric_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SalesChannel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "SalesCampaignDailyMetric_id_key" ON "SalesCampaignDailyMetric"("id");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SalesCampaignDailyMetric_date_idx" ON "SalesCampaignDailyMetric"("date");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SalesCampaignDailyMetric_provider_date_idx" ON "SalesCampaignDailyMetric"("provider", "date");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SalesCampaignDailyMetric_channelId_date_idx" ON "SalesCampaignDailyMetric"("channelId", "date");`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiConversation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiMessage" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "conversationId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "IntegrationAccount" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
      "channelId" TEXT,
      "externalAccountId" TEXT,
      "externalAccountType" TEXT,
      "externalAccountName" TEXT,
      "accessTokenEnc" TEXT,
      "refreshTokenEnc" TEXT,
      "tokenExpiresAt" DATETIME,
      "scopesJson" TEXT NOT NULL DEFAULT '[]',
      "metadataJson" TEXT,
      "settingsJson" TEXT,
      "lastTestAt" DATETIME,
      "lastSyncAt" DATETIME,
      "lastErrorCode" TEXT,
      "lastErrorMessage" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "IntegrationAccount_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SalesChannel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "IntegrationAccount_organizationId_provider_idx" ON "IntegrationAccount"("organizationId", "provider");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "IntegrationAccount_organizationId_status_idx" ON "IntegrationAccount"("organizationId", "status");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "IntegrationAccount_channelId_idx" ON "IntegrationAccount"("channelId");`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "IntegrationConfig" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "integrationAccountId" TEXT,
      "provider" TEXT NOT NULL,
      "configType" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "valueJson" TEXT NOT NULL,
      "rawPayloadJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "IntegrationConfig_integrationAccountId_fkey" FOREIGN KEY ("integrationAccountId") REFERENCES "IntegrationAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationConfig_organizationId_provider_configType_key_key" ON "IntegrationConfig"("organizationId", "provider", "configType", "key");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "IntegrationConfig_organizationId_provider_idx" ON "IntegrationConfig"("organizationId", "provider");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "IntegrationConfig_integrationAccountId_idx" ON "IntegrationConfig"("integrationAccountId");`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "IntegrationSecret" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "integrationAccountId" TEXT,
      "provider" TEXT NOT NULL,
      "secretType" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'NEEDS_CONFIGURATION',
      "secretRef" TEXT,
      "maskedValue" TEXT,
      "fingerprint" TEXT,
      "expiresAt" DATETIME,
      "lastRotatedAt" DATETIME,
      "metadataJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "IntegrationSecret_integrationAccountId_fkey" FOREIGN KEY ("integrationAccountId") REFERENCES "IntegrationAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationSecret_organizationId_provider_secretType_key_key" ON "IntegrationSecret"("organizationId", "provider", "secretType", "key");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "IntegrationSecret_organizationId_status_idx" ON "IntegrationSecret"("organizationId", "status");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "IntegrationSecret_integrationAccountId_idx" ON "IntegrationSecret"("integrationAccountId");`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "IntegrationMapping" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "integrationAccountId" TEXT,
      "provider" TEXT NOT NULL,
      "mappingType" TEXT NOT NULL,
      "sourceValue" TEXT NOT NULL,
      "targetValue" TEXT NOT NULL,
      "isDefault" BOOLEAN NOT NULL DEFAULT false,
      "rawPayloadJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "IntegrationMapping_integrationAccountId_fkey" FOREIGN KEY ("integrationAccountId") REFERENCES "IntegrationAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationMapping_organizationId_provider_mappingType_sourceValue_key" ON "IntegrationMapping"("organizationId", "provider", "mappingType", "sourceValue");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "IntegrationMapping_organizationId_provider_idx" ON "IntegrationMapping"("organizationId", "provider");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "IntegrationMapping_integrationAccountId_idx" ON "IntegrationMapping"("integrationAccountId");`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "IntegrationLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "operation" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "errorMessage" TEXT,
      "externalStatusCode" INTEGER,
      "requestPayloadJson" TEXT,
      "responsePayloadJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "IntegrationLog_organizationId_provider_idx" ON "IntegrationLog"("organizationId", "provider");`);
}
