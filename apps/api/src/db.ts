import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, "..");
config({ path: resolve(apiRoot, ".env") });

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith("file:./")) {
  process.env.DATABASE_URL = `file:${resolve(apiRoot, "prisma", "dev.db").replace(/\\/g, "/")}`;
}

export const prisma = new PrismaClient();
