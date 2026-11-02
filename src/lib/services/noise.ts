import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { DEFAULT_THRESHOLD, round2, thresholdFromPairs } from "@/lib/domain/noise";
import { TRACKED_CONCERNS } from "@/lib/youcam/concerns";

/** Two calibration scans count as a pair when taken within this window. */
const PAIR_WINDOW_MS = 30 * 60 * 1000;

export async function thresholdsFor(userId: string): Promise<{ thresholds: Record<string, number>; calibrated: boolean }> {
  const d = await db();
  const rows = await d.select().from(schema.noiseProfiles).where(eq(schema.noiseProfiles.userId, userId));
  const thresholds: Record<string, number> = Object.fromEntries(TRACKED_CONCERNS.map((c) => [c, DEFAULT_THRESHOLD]));
  for (const r of rows) thresholds[r.concern] = round2(r.threshold);
  return { thresholds, calibrated: rows.length > 0 };
}

/**
 * Recompute the user's noise profile from *all* successful calibration scans (idempotent).
 * Consecutive calibration scans of the same mode taken within 30 minutes form a pair.
 */
export async function recomputeNoiseProfile(userId: string): Promise<number> {
  const d = await db();
  const cal = await d
    .select({ id: schema.scans.id, mode: schema.scans.mode, createdAt: schema.scans.createdAt })
    .from(schema.scans)
    .where(and(eq(schema.scans.userId, userId), eq(schema.scans.isCalibration, true), eq(schema.scans.status, "success")))
    .orderBy(asc(schema.scans.createdAt));
  if (cal.length < 2) return 0;

  const scores = await d
    .select()
    .from(schema.scanScores)
    .where(inArray(schema.scanScores.scanId, cal.map((c) => c.id)));
  const byScan = new Map<string, Record<string, number>>();
  for (const s of scores) {
    if (s.rawScore === null) continue;
    const m = byScan.get(s.scanId) ?? {};
    m[s.concern] = s.rawScore;
    byScan.set(s.scanId, m);
  }

  const acc: Record<string, { sumSq: number; n: number }> = {};
  let pairs = 0;
  for (let i = 0; i + 1 < cal.length; ) {
    const a = cal[i];
    const b = cal[i + 1];
    if (a.mode === b.mode && b.createdAt.getTime() - a.createdAt.getTime() <= PAIR_WINDOW_MS) {
      const sa = byScan.get(a.id) ?? {};
      const sb = byScan.get(b.id) ?? {};
      for (const concern of Object.keys(sa)) {
        if (!(concern in sb)) continue;
        const diff = sa[concern] - sb[concern];
        acc[concern] ??= { sumSq: 0, n: 0 };
        acc[concern].sumSq += diff * diff;
        acc[concern].n += 1;
      }
      pairs++;
      i += 2;
    } else {
      i += 1;
    }
  }

  for (const [concern, { sumSq, n }] of Object.entries(acc)) {
    const values = { userId, concern, threshold: thresholdFromPairs(sumSq, n), nPairs: n, sumSqDiff: sumSq, updatedAt: new Date() };
    await d
      .insert(schema.noiseProfiles)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.noiseProfiles.userId, schema.noiseProfiles.concern],
        set: { threshold: values.threshold, nPairs: n, sumSqDiff: sumSq, updatedAt: values.updatedAt },
      });
  }
  return pairs;
}

/** Median brightness of the user's calibration photos: the lighting later scans should match (DECISION D-38). */
export async function calibrationLight(userId: string): Promise<number | null> {
  const d = await db();
  const rows = await d
    .select({ quality: schema.scans.quality })
    .from(schema.scans)
    .where(and(eq(schema.scans.userId, userId), eq(schema.scans.isCalibration, true), eq(schema.scans.status, "success")));
  const values = rows
    .map((r) => r.quality?.brightness ?? 0)
    .filter((b) => b > 0)
    .sort((a, b) => a - b);
  return values.length ? values[Math.floor(values.length / 2)] : null;
}
