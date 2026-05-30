# Modul Sprzedaz - plan budowy zgodny z Anielski Hub v2

## Decyzja architektoniczna

Budujemy osobny modul `sales`, ktory od poczatku ma taka sama strukture jak moduly w `anielski-hub-v2`. Modul ma dzialac samodzielnie w fazie prototypu, ale jego foldery, nazwy komponentow, endpointow i kontraktow maja byc gotowe do przeniesienia do glownej aplikacji.

Docelowa zakladka w Anielski Hub v2:

- grupa lub pozycja menu: `Sprzedaz`
- route: `/sales`
- podstrony: `/sales/summary`, `/sales/orders`, `/sales/products`, `/sales/customers`, `/sales/marketing`, `/sales/traffic`, `/sales/integrations`, `/sales/settings`
- permission: `sales:read`, pozniej `sales:write`, `sales:integrations`, `sales:ai`

## Aktualna struktura Anielski Hub v2

Repozytorium:

- `apps/web` - React + Vite frontend
- `apps/api` - NestJS API
- `apps/worker` - procesy tle
- `packages/*` - paczki wspoldzielone
- `packages/database/prisma` - schemat bazy
- `apps/web/src/features/*` - moduly frontendu
- `apps/api/src/*` - moduly backendu

Najbardziej podobny wzorzec do nasladowania:

- frontend: `apps/web/src/features/marketing`
- API: `apps/api/src/marketing`
- nawigacja: `apps/web/src/config/navigation.ts`
- routing aplikacji: `apps/web/src/main.tsx`
- rejestracja API: `apps/api/src/app.module.ts`

## Docelowa struktura plikow frontendu

```
apps/web/src/features/sales/
  SalesView.tsx
  types.ts
  utils.ts
  api/
    sales-api.ts
    sales-analytics-api.ts
  components/
    SalesAiPanel.tsx
    SalesDateRangePicker.tsx
    SalesFilterBar.tsx
    SalesKpiCard.tsx
    SalesKpiGrid.tsx
    SalesMetricBadge.tsx
    SalesSectionTabs.tsx
    SalesTable.tsx
    SalesChartCard.tsx
    SalesEmptyState.tsx
    SalesModal.tsx
    index.ts
  screens/
    SummaryScreen.tsx
    OrdersScreen.tsx
    ProductsScreen.tsx
    CustomersScreen.tsx
    MarketingScreen.tsx
    TrafficScreen.tsx
    SalesIntegrationsScreen.tsx
    SalesSettingsScreen.tsx
  summary/
    summary-metrics.ts
    summary-kpi-grid.tsx
    revenue-cost-chart.tsx
    key-indicators-panel.tsx
    ad-performance-panel.tsx
    customer-segments-panel.tsx
    top-products-table.tsx
    purchase-funnel.tsx
    channel-analysis.tsx
  orders/
    orders-overview-tab.tsx
    discounts-tab.tsx
    payments-tab.tsx
    delivery-tab.tsx
  products/
    products-overview-tab.tsx
    products-table-tab.tsx
    prices-tab.tsx
    product-name-words-tab.tsx
  customers/
    customers-overview-tab.tsx
    customer-products-tab.tsx
    ltv-retention-tab.tsx
    frequency-tab.tsx
  marketing/
    marketing-overview-tab.tsx
    campaigns-tab.tsx
    google-ads-tab.tsx
    meta-ads-tab.tsx
    tiktok-ads-tab.tsx
  traffic/
    traffic-overview-tab.tsx
    traffic-products-tab.tsx
    sources-events-tab.tsx
  __tests__/
    sales-metrics.test.ts
    SalesView.test.tsx
```

## Docelowa struktura API

```
apps/api/src/sales/
  sales.module.ts
  sales.controller.ts
  sales.service.ts
  sales-metrics.service.ts
  sales-ai.service.ts
  dto/
    sales-query.dto.ts
    sales-ai-query.dto.ts
    import-sales-file.dto.ts
  summary/
    sales-summary.controller.ts
    sales-summary.service.ts
  orders/
    sales-orders.controller.ts
    sales-orders.service.ts
  products/
    sales-products.controller.ts
    sales-products.service.ts
  customers/
    sales-customers.controller.ts
    sales-customers.service.ts
  marketing/
    sales-marketing.controller.ts
    sales-marketing.service.ts
  traffic/
    sales-traffic.controller.ts
    sales-traffic.service.ts
  integrations/
    sales-integrations.controller.ts
    sales-integrations.service.ts
  imports/
    sales-imports.controller.ts
    sales-imports.service.ts
  __tests__/
    sales-metrics.service.spec.ts
    sales.controller.spec.ts
```

## Endpointy API

Wszystkie endpointy powinny byc pod `/api/sales`.

Podstawowe:

- `GET /api/sales/summary`
- `GET /api/sales/orders`
- `GET /api/sales/orders/discounts`
- `GET /api/sales/orders/payments`
- `GET /api/sales/orders/delivery`
- `GET /api/sales/products`
- `GET /api/sales/products/prices`
- `GET /api/sales/products/name-words`
- `GET /api/sales/customers`
- `GET /api/sales/customers/ltv-retention`
- `GET /api/sales/customers/frequency`
- `GET /api/sales/marketing`
- `GET /api/sales/marketing/campaigns`
- `GET /api/sales/marketing/google-ads`
- `GET /api/sales/marketing/meta-ads`
- `GET /api/sales/marketing/tiktok-ads`
- `GET /api/sales/traffic`
- `GET /api/sales/traffic/products`
- `GET /api/sales/traffic/sources-events`
- `GET /api/sales/integrations`
- `POST /api/sales/imports`
- `POST /api/sales/ai/query`

Wspolne query params:

- `from`
- `to`
- `compareFrom`
- `compareTo`
- `channels`
- `currency`
- `granularity`

Przyklad:

```
GET /api/sales/summary?from=2026-05-22&to=2026-05-28&compareFrom=2026-05-15&compareTo=2026-05-21&channels=PL,UK
```

## Nawigacja w Anielski Hub v2

W `apps/web/src/config/navigation.ts` dodac grupe:

```
{
  id: "sales-group",
  label: "Sprzedaż",
  icon: BarChart3,
  children: [
    { id: "sales-summary", label: "Podsumowanie", icon: Gauge, permission: "sales:read", section: "sales", salesTab: "summary" },
    { id: "sales-orders", label: "Zamówienia", icon: ShoppingCart, permission: "sales:read", section: "sales", salesTab: "orders" },
    { id: "sales-products", label: "Produkty", icon: Package, permission: "sales:read", section: "sales", salesTab: "products" },
    { id: "sales-customers", label: "Klienci", icon: UserRound, permission: "sales:read", section: "sales", salesTab: "customers" },
    { id: "sales-marketing", label: "Marketing", icon: Megaphone, permission: "sales:read", section: "sales", salesTab: "marketing" },
    { id: "sales-traffic", label: "Ruch", icon: Activity, permission: "sales:read", section: "sales", salesTab: "traffic" },
    { id: "sales-integrations", label: "Integracje danych", icon: Route, permission: "sales:integrations", section: "sales", salesTab: "integrations" },
    { id: "sales-settings", label: "Ustawienia", icon: Settings2, permission: "sales:write", section: "sales", salesTab: "settings" }
  ]
}
```

W `apps/web/src/main.tsx` dodac routing analogicznie do marketingu:

- state: `activeSalesTab`
- `routeStateFromLocation()` obsluguje `/sales` i `/sales/*`
- `routePathForNavItem()` obsluguje `section === "sales"`
- renderuje `<SalesView activeTab={activeSalesTab} ... />`

## Minimalny model danych

Na start nie budujemy pelnych integracji. Najszybsza droga to import CSV/XLSX i mock/demo data zgodne z ekranami.

Encje:

- `SalesChannel`
- `SalesOrder`
- `SalesOrderItem`
- `SalesProduct`
- `SalesCustomer`
- `SalesMarketingDailyStat`
- `SalesTrafficDailyStat`
- `SalesImportBatch`
- `SalesAiConversation`
- `SalesAiMessage`

Metryki:

- revenueNet
- revenueGross
- totalCost
- productCost
- mediaCost
- additionalCost
- marketplaceCost
- netProfit
- margin
- cos
- orders
- unitsSold
- discounts
- aov
- newCustomers
- returningCustomers
- sessions
- productViews
- addToCart
- checkoutStarted
- transactions
- impressions
- clicks
- cpc
- ctr
- cpm
- roas

## MVP wdrozeniowe

Etap 1 - UI shell i mock data:

- stworzyc `SalesView`,
- dodac podzakladki,
- zbudowac layout jak DataOrganizer,
- dane trzymac lokalnie w pliku `mock-sales-data.ts`,
- zero backendu na tym etapie.

Etap 2 - API read-only:

- stworzyc `SalesModule` w NestJS,
- endpoint `/api/sales/summary`,
- endpointy dla glownych ekranow,
- dane nadal seedowane/mockowane, ale przez API.

Etap 3 - import danych:

- upload CSV/XLSX,
- mapowanie kolumn,
- zapis importu,
- przeliczanie metryk.

Etap 4 - AI panel:

- panel czatu,
- gotowe prompty per ekran,
- endpoint `/api/sales/ai/query`,
- odpowiedzi tekstowe, tabelaryczne i wykresowe.

Etap 5 - integracja z Anielski Hub v2:

- przeniesienie folderu `apps/web/src/features/sales`,
- dodanie `SalesModule` do `apps/api/src/app.module.ts`,
- dodanie migracji Prisma,
- dodanie permissions,
- dodanie pozycji w nawigacji.

## Pytania wymagane przed pierwsza implementacja

1. Czy w pierwszej wersji robimy tylko frontend z mock data, czy od razu backend `/api/sales`?
2. Czy nazwa zakladki ma byc dokladnie `Sprzedaż`, czy np. `Analityka sprzedaży`?
3. Czy pierwszy import danych ma obslugiwac CSV/XLSX, czy najpierw wpisujemy dane demo na sztywno?
4. Czy UI ma byc maksymalnie podobne do DataOrganizer, czy dopasowane wizualnie do Anielski Hub v2?
5. Czy AI panel w pierwszej wersji ma tylko udawac odpowiedzi, czy ma byc od razu podlaczony do realnego modelu?

## Rekomendacja

Najprosciej i najszybciej:

1. Budujemy `apps/web/src/features/sales` jako osobny frontendowy modul z mock data.
2. Dodajemy go do Anielski Hub v2 pod route `/sales`.
3. Dopiero po zatwierdzeniu UI budujemy API i import danych.

To pozwala szybko odtworzyc wyglad i funkcje DataOrganizer bez blokowania sie na bazie, integracjach i AI. Jednoczesnie struktura plikow bedzie juz zgodna z Anielski Hub v2.
