import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { compareScoreMaps } from "@/lib/domain/noise";
import { EXPERIMENTS, evaluateExperiment, summarize, type ExperimentKind, type ExperimentResult } from "@/lib/domain/validation";
import { thresholdsFor } from "./noise";
import { refreshScan, scoresFor, toScoreMap, type ScanRow } from "./scans";

export class ExperimentError extends Error {}

const KINDS = Object.keys(EXPERIMENTS) as ExperimentKind[];

async function ownValidationScan(userId: string, scanId: string): Promise<ScanRow> {
  const scan = await refreshScan(userId, scanId);
  if (!scan) throw new ExperimentError("Scan not found.");
  if (scan.context !== "validation") throw new ExperimentError("Validation tests use their own scans, taken from the Evidence page.");
  return scan;
}

export async function createExperiment(userId: string, kind: string, beforeScanId: string) {
  if (!KINDS.includes(kind as ExperimentKind)) throw new ExperimentError("Unknown test type.");
  await ownValidationScan(userId, beforeScanId);
  const d = await db();
  const [row] = await d
    .insert(schema.experiments)
    .values({ userId, kind: kind as ExperimentKind, beforeScanId })
    .returning();
  return row;
}

export async function attachAfterScan(userId: string, id: string, afterScanId: string) {
  const d = await db();
  const [exp] = await d.select().from(schema.experiments).where(and(eq(schema.experiments.id, id), eq(schema.experiments.userId, userId)));
  if (!exp) return null;
  if (exp.afterScanId) throw new ExperimentError("This test already has its second photo.");
  if (afterScanId === exp.beforeScanId) throw new ExperimentError("Use a new photo for the second scan.");
  await ownValidationScan(userId, afterScanId);
  const [row] = await d.update(schema.experiments).set({ afterScanId }).where(eq(schema.experiments.id, id)).returning();
  return row;
}

export async function deleteExperiment(userId: string, id: string) {
  const d = await db();
  await d.delete(schema.experiments).where(and(eq(schema.experiments.id, id), eq(schema.experiments.userId, userId)));
}

type ExperimentView = {
  id: string;
  kind: ExperimentKind;
  createdAt: Date;
  beforeScanId: string;
  afterScanId: string | null;
  status: "needs_after" | "analyzing" | "failed" | "done";
  isMock: boolean;
  result: ExperimentResult | null;
};

/** The user's tests with their results, plus the noise profile they test and an overall summary. */
export async function validationReport(userId: string) {
  const d = await db();
  const rows = await d.select().from(schema.experiments).where(eq(schema.experiments.userId, userId)).orderBy(desc(schema.experiments.createdAt));
  const { thresholds, calibrated } = await thresholdsFor(userId);

  const scanIds = [...new Set(rows.flatMap((r) => [r.beforeScanId, r.afterScanId].filter((x): x is string => !!x)))];
  const scans = new Map<string, ScanRow>();
  for (const id of scanIds) {
    const s = await refreshScan(userId, id); // advances any scan still being analyzed
    if (s) scans.set(id, s);
  }
  const scores = await scoresFor([...scans.values()].filter((s) => s.status === "success").map((s) => s.id));

  const experiments: ExperimentView[] = rows.map((r) => {
    const before = scans.get(r.beforeScanId);
    const after = r.afterScanId ? scans.get(r.afterScanId) : undefined;
    const base = { id: r.id, kind: r.kind, createdAt: r.createdAt, beforeScanId: r.beforeScanId, afterScanId: r.afterScanId, isMock: !!(before?.isMock || after?.isMock) };
    if (before?.status === "error" || after?.status === "error") return { ...base, status: "failed", result: null };
    if (!r.afterScanId) return { ...base, status: "needs_after", result: null };
    if (before?.status !== "success" || after?.status !== "success") return { ...base, status: "analyzing", result: null };
    const comparison = compareScoreMaps(toScoreMap(scores.get(before.id)), toScoreMap(scores.get(after.id)), thresholds);
    return { ...base, status: "done", result: evaluateExperiment(r.kind, comparison) };
  });

  const done = experiments.filter((e): e is ExperimentView & { result: ExperimentResult } => e.status === "done" && !!e.result);
  const profile = await d.select().from(schema.noiseProfiles).where(eq(schema.noiseProfiles.userId, userId));

  return {
    calibrated,
    bands: Object.entries(thresholds)
      .map(([concern, threshold]) => ({ concern, threshold, pairs: profile.find((p) => p.concern === concern)?.nPairs ?? 0 }))
      .sort((a, b) => a.threshold - b.threshold),
    experiments,
    summary: summarize(done),
    includesSimulated: done.some((e) => e.isMock),
  };
}
