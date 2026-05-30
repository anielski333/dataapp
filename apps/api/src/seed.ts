import "dotenv/config";
import { prisma } from "./db.js";
import { ensureSchema } from "./schema.js";

const channels = [
  { id: "pl", name: "PL", market: "Polska", currency: "PLN" },
  { id: "uk", name: "UK", market: "United Kingdom", currency: "PLN" },
];

function day(offset: number) {
  const date = new Date("2026-05-22T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

const base = [
  { revenue: 11840, cost: 6950, orders: 111, units: 702, sessions: 2450, impressions: 171000, clicks: 1180 },
  { revenue: 13220, cost: 7850, orders: 129, units: 771, sessions: 2630, impressions: 183000, clicks: 1294 },
  { revenue: 12110, cost: 7200, orders: 117, units: 711, sessions: 2515, impressions: 176000, clicks: 1210 },
  { revenue: 16040, cost: 9420, orders: 157, units: 970, sessions: 3150, impressions: 211000, clicks: 1544 },
  { revenue: 13590, cost: 8050, orders: 132, units: 816, sessions: 2810, impressions: 189000, clicks: 1342 },
  { revenue: 14930, cost: 8670, orders: 146, units: 901, sessions: 2970, impressions: 199000, clicks: 1421 },
  { revenue: 14550, cost: 7664, orders: 132, units: 454, sessions: 2228, impressions: 187251, clicks: 1260 },
];

const products = [
  ["p-853917", "Kapsułki wygładzający BEGONIA Róża 30ml", "853917", "pl", 6921.71, 155, 4.8, 41, 44.66, 19.2, -13.4],
  ["p-973920", "Kapsułki nawilżający ANEMONE Kokos 500ml", "973920", "pl", 2467.5, 125, 3.2, 35, 19.74, 11.9, -18.47],
  ["p-836319", "Pianka wygładzający COSMOS Papaja 400ml", "836319", "pl", 2382.8, 145, 6.1, 52, 16.43, 7.85, 54.55],
  ["p-963944", "Tonik wygładzający SERENE Bambus 500ml", "963944", "pl", 2276.75, 175, 7.4, 48, 13.01, 6.76, 88.81],
  ["p-209094", "Spray rozświetlający VIOLETZ Eukaliptus 30ml", "209094", "uk", 2141.63, 37, 2.9, 44, 57.88, 32.5, -4.55],
  ["p-1042863", "Szampon przeciwzmarszczkowy VIBRANT Jagoda Acai 150ml", "1042863", "pl", 1923.32, 181, 2.1, 29, 10.63, 7.6, -43.61],
] as const;

const campaigns = [
  ["c-google", "Google", "Brand Search PL", 6440, 28210, 631000, 4380, 271],
  ["c-meta", "Meta", "Prospecting beauty segment", 5420, 16780, 566000, 3920, 205],
  ["c-tiktok", "TikTok", "UGC test maj", 1265, 0, 119251, 951, 46],
] as const;

export async function seed() {
  await ensureSchema();
  for (const channel of channels) {
    await prisma.salesChannel.upsert({ where: { id: channel.id }, create: channel, update: channel });
  }

  for (const channel of channels) {
    for (let i = 0; i < base.length; i += 1) {
      const multiplier = channel.id === "uk" ? 0.14 : 1;
      const item = base[i];
      const revenueNet = Number((item.revenue * multiplier).toFixed(2));
      const totalCost = Number((item.cost * multiplier).toFixed(2));
      await prisma.salesDailyMetric.upsert({
        where: { channelId_date: { channelId: channel.id, date: day(i) } },
        create: {
          channelId: channel.id,
          date: day(i),
          revenueNet,
          totalCost,
          productCost: Number((totalCost * 0.74).toFixed(2)),
          mediaCost: Number((totalCost * 0.21).toFixed(2)),
          additionalCost: 0,
          marketplaceCost: 0,
          discounts: Number((revenueNet * 0.193).toFixed(2)),
          orders: Math.round(item.orders * multiplier),
          unitsSold: Math.round(item.units * multiplier),
          newCustomers: Math.round(item.orders * 0.48 * multiplier),
          returningCustomers: Math.round(item.orders * 0.67 * multiplier),
          sessions: Math.round(item.sessions * multiplier),
          productViews: Math.round(item.sessions * 0.6922 * multiplier),
          addToCart: Math.round(item.sessions * 0.1336 * multiplier),
          checkoutStarted: Math.round(item.sessions * 0.0738 * multiplier),
          transactions: Math.round(item.sessions * 0.0427 * multiplier),
          impressions: Math.round(item.impressions * multiplier),
          clicks: Math.round(item.clicks * multiplier),
          adConversions: Math.round(item.orders * 0.51 * multiplier),
        },
        update: {},
      });
    }
  }

  for (const product of products) {
    await prisma.salesProduct.upsert({
      where: { id: product[0] },
      create: {
        id: product[0],
        name: product[1],
        sku: product[2],
        channelId: product[3],
        revenueNet: product[4],
        unitsSold: product[5],
        conversion: product[6],
        margin: product[7],
        price: product[8],
        productCost: product[9],
        changePct: product[10],
      },
      update: {},
    });
  }

  for (const campaign of campaigns) {
    await prisma.salesCampaign.upsert({
      where: { id: campaign[0] },
      create: {
        id: campaign[0],
        provider: campaign[1],
        name: campaign[2],
        spend: campaign[3],
        revenue: campaign[4],
        impressions: campaign[5],
        clicks: campaign[6],
        conversions: campaign[7],
      },
      update: {},
    });
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  seed()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
