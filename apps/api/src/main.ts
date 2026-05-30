import "dotenv/config";
import cors from "cors";
import express from "express";
import { seedIfEmpty } from "./startup-seed.js";
import { integrationsRouter } from "./integrations.js";
import { salesRouter } from "./sales.js";

const app = express();
const port = Number(process.env.API_PORT || 4105);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "sales-dataorganizer-api" });
});

app.use("/api/sales", salesRouter);
app.use("/api/integrations", integrationsRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  res.status(500).json({ error: message });
});

await seedIfEmpty();

app.listen(port, () => {
  console.log(`Sales API listening on http://localhost:${port}`);
});
