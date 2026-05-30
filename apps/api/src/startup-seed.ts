import { prisma } from "./db.js";
import { seed } from "./seed.js";
import { ensureSchema } from "./schema.js";

export async function seedIfEmpty() {
  await ensureSchema();
  const channels = await prisma.salesChannel.count();
  if (channels > 0) return;
  await seed();
}
