import { and, eq, gt, sql } from "drizzle-orm";
import { config } from "@/lib/config";
import { db, schema } from "@/lib/db/client";

export async function recordUsage(entry: {
  userId?: string;
  provider: "youcam" | "llm";
  operation: string;
  units: number;
  meta?: Record<string, unknown>;
}) {
  const d = await db();
  await d.insert(schema.apiUsage).values(entry);
}

/** Real YouCam units spent across the whole app (mock scans are logged with 0 units). */
export async function youcamUnits(): Promise<{ used: number; budget: number; remaining: number }> {
  const d = await db();
  const [row] = await d
    .select({ used: sql<number>`coalesce(sum(${schema.apiUsage.units}), 0)::int` })
    .from(schema.apiUsage)
    .where(and(eq(schema.apiUsage.provider, "youcam")));
  const budget = config().YOUCAM_UNIT_BUDGET;
  const used = Number(row?.used ?? 0);
  return { used, budget, remaining: Math.max(0, budget - used) };
}

/** A per-user daily cap was hit (DECISION D-37). Mapped to HTTP 429. */
export class QuotaExceeded extends Error {}

/** Billable calls this user made to `provider` in the last 24 hours (mock YouCam scans don't count). */
async function callsLastDay(userId: string, provider: "youcam" | "llm"): Promise<number> {
  const d = await db();
  const since = new Date(Date.now() - 86_400_000);
  const conditions = [eq(schema.apiUsage.userId, userId), eq(schema.apiUsage.provider, provider), gt(schema.apiUsage.createdAt, since)];
  if (provider === "youcam") conditions.push(gt(schema.apiUsage.units, 0));
  const [row] = await d.select({ n: sql<number>`count(*)::int` }).from(schema.apiUsage).where(and(...conditions));
  return Number(row?.n ?? 0);
}

export async function assertDailyQuota(userId: string, provider: "youcam" | "llm"): Promise<void> {
  const c = config();
  const limit = provider === "youcam" ? c.SCANS_PER_USER_PER_DAY : c.AI_CALLS_PER_USER_PER_DAY;
  if (!limit || (await callsLastDay(userId, provider)) < limit) return;
  throw new QuotaExceeded(
    provider === "youcam"
      ? `You've reached today's limit of ${limit} live scans. Skin doesn't change by the hour — come back tomorrow.`
      : `You've reached today's limit of ${limit} AI requests. Please try again tomorrow.`,
  );
}
