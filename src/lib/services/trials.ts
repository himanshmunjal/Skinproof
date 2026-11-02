import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import type { TrialVerdict } from "@/lib/db/schema";
import { TRIAL_DAYS, evaluateTrial, MIN_DAYS_FOR_VERDICT } from "@/lib/domain/trial";
import { TRACKED_CONCERNS } from "@/lib/youcam/concerns";
import { thresholdsFor } from "./noise";
import { getProduct } from "./products";
import { isMeasurement, scoresFor, settleRunningScans, toScoreMap } from "./scans";

export class TrialError extends Error {}
export type TrialRow = typeof schema.trials.$inferSelect;

/** Baseline = the latest calibration pair if recent, else the last two successful scans. */
async function pickBaseline(userId: string): Promise<string[]> {
  const d = await db();
  const recent = await d
    .select()
    .from(schema.scans)
    .where(and(eq(schema.scans.userId, userId), eq(schema.scans.status, "success"), isMeasurement))
    .orderBy(desc(schema.scans.createdAt))
    .limit(6);
  if (!recent.length) return [];
  const cal = recent.filter((s) => s.isCalibration && s.mode === recent[0].mode).slice(0, 2);
  const fortnight = Date.now() - 14 * 86_400_000;
  if (cal.length === 2 && cal.every((s) => s.createdAt.getTime() > fortnight)) return cal.map((s) => s.id);
  return recent.filter((s) => s.mode === recent[0].mode).slice(0, 2).map((s) => s.id);
}

export async function startTrial(userId: string, productId: string, targetConcerns: string[]) {
  const product = await getProduct(userId, productId);
  if (!product) throw new TrialError("Product not found on your shelf.");
  const targets = [...new Set(targetConcerns)].filter((c) => (TRACKED_CONCERNS as string[]).includes(c));
  if (!targets.length) throw new TrialError("Pick at least one concern to track.");
  const d = await db();
  const [active] = await d
    .select()
    .from(schema.trials)
    .where(and(eq(schema.trials.userId, userId), eq(schema.trials.status, "active")));
  if (active) throw new TrialError("You already have an active trial. One change at a time is the only way to know what worked — finish or stop it first.");
  await settleRunningScans(userId);
  const baselineScanIds = await pickBaseline(userId);
  if (!baselineScanIds.length) throw new TrialError("Take a baseline scan first (ideally the 2-photo calibration).");
  const startAt = new Date();
  const [trial] = await d
    .insert(schema.trials)
    .values({ userId, productId, targetConcerns: targets, baselineScanIds, startAt, endAt: new Date(startAt.getTime() + TRIAL_DAYS * 86_400_000) })
    .returning();
  return trial;
}

export async function evaluate(userId: string, trial: TrialRow, now = new Date()): Promise<TrialVerdict> {
  const d = await db();
  const baselineScans = await d.select().from(schema.scans).where(inArray(schema.scans.id, trial.baselineScanIds));
  const mode = baselineScans[0]?.mode;
  const checkinScans = (
    await d
      .select()
      .from(schema.scans)
      .where(and(eq(schema.scans.userId, userId), eq(schema.scans.status, "success"), isMeasurement, gte(schema.scans.createdAt, trial.startAt)))
      .orderBy(asc(schema.scans.createdAt))
  ).filter((s) => s.mode === mode && !trial.baselineScanIds.includes(s.id));
  const scores = await scoresFor([...baselineScans, ...checkinScans].map((s) => s.id));
  const { thresholds } = await thresholdsFor(userId);
  const verdict = evaluateTrial({
    startAt: trial.startAt,
    now: trial.status === "active" ? now : trial.endAt < now ? trial.endAt : now,
    targetConcerns: trial.targetConcerns,
    baseline: baselineScans.map((s) => toScoreMap(scores.get(s.id))),
    checkins: checkinScans.map((s) => toScoreMap(scores.get(s.id))),
    thresholds,
  });
  const done = trial.status === "active" && verdict.day >= TRIAL_DAYS;
  await d
    .update(schema.trials)
    .set({ verdict, ...(done ? { status: "completed" as const } : {}) })
    .where(eq(schema.trials.id, trial.id));
  return verdict;
}

export async function listTrials(userId: string) {
  const d = await db();
  const rows = await d.select().from(schema.trials).where(eq(schema.trials.userId, userId)).orderBy(desc(schema.trials.createdAt));
  const productIds = [...new Set(rows.map((r) => r.productId))];
  const products = productIds.length ? await d.select().from(schema.products).where(inArray(schema.products.id, productIds)) : [];
  const reviews = rows.length
    ? await d.select().from(schema.verifiedReviews).where(inArray(schema.verifiedReviews.trialId, rows.map((r) => r.id)))
    : [];
  const out = [];
  for (const t of rows) {
    const verdict = t.status === "active" ? await evaluate(userId, t) : (t.verdict ?? (await evaluate(userId, t)));
    const p = products.find((x) => x.id === t.productId);
    out.push({
      ...t,
      verdict,
      product: p ? { id: p.id, name: p.name, brand: p.brand } : null,
      review: reviews.find((r) => r.trialId === t.id) ?? null,
    });
  }
  return out;
}

export async function getTrial(userId: string, trialId: string) {
  return (await listTrials(userId)).find((t) => t.id === trialId) ?? null;
}

export async function stopTrial(userId: string, trialId: string) {
  const d = await db();
  const [t] = await d
    .update(schema.trials)
    .set({ status: "stopped" })
    .where(and(eq(schema.trials.id, trialId), eq(schema.trials.userId, userId), eq(schema.trials.status, "active")))
    .returning();
  if (!t) throw new TrialError("No active trial with that id.");
  await evaluate(userId, t);
  return t;
}

/** A Verified Result can only be written after ≥14 days with at least one measured check-in. */
export async function addReview(userId: string, trialId: string, input: { rating: number; body: string; consent: boolean }) {
  const trial = await getTrial(userId, trialId);
  if (!trial) throw new TrialError("Trial not found.");
  if (trial.review) throw new TrialError("You already reviewed this trial.");
  if (trial.verdict.day < MIN_DAYS_FOR_VERDICT || !trial.verdict.perConcern.length) {
    throw new TrialError(`Verified Results need at least ${MIN_DAYS_FOR_VERDICT} days and one check-in scan.`);
  }
  const rating = Math.min(5, Math.max(1, Math.round(input.rating)));
  const d = await db();
  const [review] = await d
    .insert(schema.verifiedReviews)
    .values({ userId, productId: trial.productId, trialId, rating, body: input.body.slice(0, 1000), deltas: trial.verdict.perConcern, consent: input.consent })
    .returning();
  return review;
}
