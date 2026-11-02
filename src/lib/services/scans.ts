import { and, asc, desc, eq, inArray, lt, ne } from "drizzle-orm";
import { config } from "@/lib/config";
import { db, schema } from "@/lib/db/client";
import type { CaptureQuality } from "@/lib/db/schema";
import { compareScoreMaps, type ConcernComparison, type ScoreMap } from "@/lib/domain/noise";
import {
  CONCERNS,
  IMAGE_RULES,
  dstActions,
  friendlyError,
  parseSkinOutput,
  unitCost,
  youcam,
  youcamFor,
  YouCamError,
  type ScanMode,
} from "@/lib/youcam";
import { ImageRejected, normalizePhoto, storeImage } from "./images";
import { recomputeNoiseProfile, thresholdsFor } from "./noise";
import { assertDailyQuota, recordUsage, youcamUnits } from "./usage";

export type ScanContext = "routine" | "calibration" | "checkin" | "breakout" | "purchase" | "validation";

/**
 * Validation-test scans (concealer, flush…) are deliberately unrepresentative, so they never feed progress,
 * trials, baselines or the coach (DECISION D-39).
 */
export const isMeasurement = ne(schema.scans.context, "validation");
export type ScanRow = typeof schema.scans.$inferSelect;
export type ScoreRow = typeof schema.scanScores.$inferSelect;

/** Pick SD/HD. A user's first successful scan locks their mode so their history stays comparable. */
async function chooseMode(userId: string, shortSide: number): Promise<ScanMode> {
  const d = await db();
  const [first] = await d
    .select({ mode: schema.scans.mode })
    .from(schema.scans)
    .where(and(eq(schema.scans.userId, userId), eq(schema.scans.status, "success")))
    .orderBy(asc(schema.scans.createdAt))
    .limit(1);
  const forced = config().YOUCAM_MODE;
  const mode: ScanMode = first?.mode ?? (forced === "auto" ? (shortSide >= IMAGE_RULES.hdMinShortSide ? "hd" : "sd") : forced);
  const min = mode === "hd" ? IMAGE_RULES.hdMinShortSide : IMAGE_RULES.sdMinShortSide;
  if (shortSide < min) {
    throw new ImageRejected(
      mode === "hd"
        ? `Your scans use HD analysis, which needs a photo at least ${min}px on its short side (this one is ${shortSide}px). Use your phone's rear camera or a higher-resolution photo.`
        : `The photo is too small (${shortSide}px). It needs at least ${min}px on its short side.`,
    );
  }
  return mode;
}

export async function createScan(input: {
  userId: string;
  photo: Buffer;
  context: ScanContext;
  quality?: Partial<CaptureQuality>;
}): Promise<ScanRow> {
  const img = await normalizePhoto(input.photo);
  const mode = await chooseMode(input.userId, Math.min(img.width, img.height));
  const client = youcam();
  const cost = unitCost(mode, CONCERNS.length);
  if (!client.isMock) {
    await assertDailyQuota(input.userId, "youcam");
    const { remaining } = await youcamUnits();
    if (remaining < cost) throw new ImageRejected(`Not enough YouCam units left (${remaining} remaining, a scan costs ${cost}).`);
  }

  const d = await db();
  const imageId = await storeImage(input.userId, "scan", img);
  const quality: CaptureQuality = {
    width: img.width,
    height: img.height,
    brightness: Number(input.quality?.brightness ?? 0),
    blur: Number(input.quality?.blur ?? 0),
    warnings: Array.isArray(input.quality?.warnings) ? input.quality!.warnings!.slice(0, 5).map(String) : [],
  };
  const [scan] = await d
    .insert(schema.scans)
    .values({
      userId: input.userId,
      imageId,
      mode,
      context: input.context,
      isCalibration: input.context === "calibration",
      quality,
      isMock: client.isMock,
    })
    .returning();

  try {
    const fileId = await client.uploadImage(img.bytes, img.mime, `scan-${scan.id}.jpg`);
    const taskId = await client.createSkinTask(fileId, dstActions(mode));
    const [running] = await d
      .update(schema.scans)
      .set({ status: "running", youcamFileId: fileId, youcamTaskId: taskId })
      .where(eq(schema.scans.id, scan.id))
      .returning();
    return running;
  } catch (err) {
    const code = err instanceof YouCamError ? err.code : "start_failed";
    const [failed] = await d
      .update(schema.scans)
      .set({ status: "error", errorCode: code, completedAt: new Date() })
      .where(eq(schema.scans.id, scan.id))
      .returning();
    console.error("[scan] failed to start YouCam task", err);
    return failed;
  }
}

/**
 * Lazy polling (DECISION D-09): if the scan is still running, do ONE status check with YouCam and persist the
 * outcome. Safe under concurrent polls — the first request to flip `running → success` inside the transaction wins.
 */
export async function refreshScan(userId: string, scanId: string): Promise<ScanRow | null> {
  const d = await db();
  const [scan] = await d.select().from(schema.scans).where(and(eq(schema.scans.id, scanId), eq(schema.scans.userId, userId)));
  if (!scan || scan.status !== "running" || !scan.youcamTaskId) return scan ?? null;

  const client = youcamFor(scan.isMock);
  let result;
  try {
    result = await client.getSkinTask(scan.youcamTaskId);
  } catch (err) {
    console.error("[scan] status check failed", err);
    return scan; // transient — the client will poll again
  }

  if (result.status === "running") return scan;

  if (result.status === "error") {
    const [failed] = await d
      .update(schema.scans)
      .set({ status: "error", errorCode: result.errorCode, rawResult: result.raw as object, completedAt: new Date() })
      .where(and(eq(schema.scans.id, scan.id), eq(schema.scans.status, "running")))
      .returning();
    return failed ?? scan;
  }

  const parsed = parseSkinOutput(result.output);
  const repeated = result.output.filter((o, i, all) => all.findIndex((x) => x.type === o.type) !== i);
  if (repeated.length) console.info("[scan] repeated output types merged:", repeated.map((o) => `${o.type}{${Object.keys(o).join(",")}}`).join(" "));
  // Copy masks before YouCam's 24h retention expires (DECISION D-10). Done before the transaction (network I/O).
  const masks = await Promise.all(
    parsed.scores.map(async (s) => {
      if (!s.maskUrl) return null;
      try {
        return await client.download(s.maskUrl);
      } catch (err) {
        console.warn(`[scan] mask download failed for ${s.concern}`, err);
        return null;
      }
    }),
  );
  const units = client.isMock ? 0 : unitCost(scan.mode, CONCERNS.length);

  const claimed = await d.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.scans)
      .set({
        status: "success",
        overallScore: parsed.overallScore,
        skinAge: parsed.skinAge,
        rawResult: result.raw as object,
        units,
        completedAt: new Date(),
      })
      .where(and(eq(schema.scans.id, scan.id), eq(schema.scans.status, "running")))
      .returning();
    if (!row) return null; // another request already stored this result
    for (let i = 0; i < parsed.scores.length; i++) {
      const s = parsed.scores[i];
      const mask = masks[i];
      let maskImageId: string | null = null;
      if (mask) {
        const [img] = await tx
          .insert(schema.images)
          .values({ userId, kind: "mask", mime: mask.mime, bytes: mask.bytes })
          .returning({ id: schema.images.id });
        maskImageId = img.id;
      }
      await tx.insert(schema.scanScores).values({ scanId: scan.id, concern: s.concern, uiScore: s.uiScore, rawScore: s.rawScore, maskImageId });
    }
    return row;
  });

  if (!claimed) {
    const [latest] = await d.select().from(schema.scans).where(eq(schema.scans.id, scan.id));
    return latest;
  }
  await recordUsage({ userId, provider: "youcam", operation: `skin-analysis:${scan.mode}`, units, meta: { scanId: scan.id, mock: client.isMock } });
  if (claimed.isCalibration) await recomputeNoiseProfile(userId);
  return claimed;
}

/**
 * Lazy polling only advances the scan someone is looking at. The calibration pair is two uploads, but the client
 * then polls only the second one — so the first stayed "running", the noise profile was never computed and the
 * user was never calibrated (DECISION D-45). Settle the user's other in-flight scans, oldest first, before any
 * read that compares scans. A no-op (one indexed query) when nothing is running.
 */
export async function settleRunningScans(userId: string, exceptId?: string): Promise<void> {
  const d = await db();
  const running = await d
    .select({ id: schema.scans.id })
    .from(schema.scans)
    .where(and(eq(schema.scans.userId, userId), eq(schema.scans.status, "running")))
    .orderBy(asc(schema.scans.createdAt))
    .limit(5);
  for (const r of running) if (r.id !== exceptId) await refreshScan(userId, r.id);
}

export async function scoresFor(scanIds: string[]): Promise<Map<string, ScoreRow[]>> {
  const map = new Map<string, ScoreRow[]>();
  if (!scanIds.length) return map;
  const d = await db();
  const rows = await d.select().from(schema.scanScores).where(inArray(schema.scanScores.scanId, scanIds));
  for (const r of rows) map.set(r.scanId, [...(map.get(r.scanId) ?? []), r]);
  return map;
}

export function toScoreMap(rows: ScoreRow[] = []): ScoreMap {
  const m: ScoreMap = {};
  for (const r of rows) if (r.rawScore !== null && r.concern !== "skin_type") m[r.concern] = r.rawScore;
  return m;
}

export async function listScans(userId: string, opts: { limit?: number; status?: "success" } = {}) {
  const d = await db();
  const rows = await d
    .select()
    .from(schema.scans)
    .where(opts.status ? and(eq(schema.scans.userId, userId), eq(schema.scans.status, opts.status), isMeasurement) : eq(schema.scans.userId, userId))
    .orderBy(desc(schema.scans.createdAt))
    .limit(opts.limit ?? 50);
  const scores = await scoresFor(rows.map((r) => r.id));
  return rows.map((r) => ({ ...publicScan(r), scores: scores.get(r.id) ?? [] }));
}

export type ScanDetail = {
  scan: ReturnType<typeof publicScan>;
  scores: ScoreRow[];
  previous: { id: string; createdAt: Date } | null;
  comparison: ConcernComparison[];
  calibrated: boolean;
};

export async function scanDetail(userId: string, scanId: string): Promise<ScanDetail | null> {
  await settleRunningScans(userId, scanId);
  const scan = await refreshScan(userId, scanId);
  if (!scan) return null;
  const scores = (await scoresFor([scan.id])).get(scan.id) ?? [];
  const { thresholds, calibrated } = await thresholdsFor(userId);
  let previous: ScanDetail["previous"] = null;
  let comparison: ConcernComparison[] = [];
  if (scan.status === "success") {
    const d = await db();
    const [prev] = await d
      .select()
      .from(schema.scans)
      .where(
        and(
          eq(schema.scans.userId, userId),
          eq(schema.scans.status, "success"),
          eq(schema.scans.mode, scan.mode),
          isMeasurement,
          ne(schema.scans.id, scan.id),
          lt(schema.scans.createdAt, scan.createdAt),
        ),
      )
      .orderBy(desc(schema.scans.createdAt))
      .limit(1);
    if (prev) {
      previous = { id: prev.id, createdAt: prev.createdAt };
      const prevScores = (await scoresFor([prev.id])).get(prev.id) ?? [];
      comparison = compareScoreMaps(toScoreMap(prevScores), toScoreMap(scores), thresholds);
    }
  }
  return { scan: publicScan(scan), scores, previous, comparison, calibrated };
}

/** Progress series per concern for successful scans in the user's locked mode. */
export async function progress(userId: string) {
  await settleRunningScans(userId);
  const d = await db();
  const rows = await d
    .select()
    .from(schema.scans)
    .where(and(eq(schema.scans.userId, userId), eq(schema.scans.status, "success"), isMeasurement))
    .orderBy(asc(schema.scans.createdAt));
  const mode = rows[0]?.mode;
  const scans = rows.filter((r) => r.mode === mode);
  const scores = await scoresFor(scans.map((s) => s.id));
  const series: Record<string, { t: string; scanId: string; raw: number; ui: number | null; context: string }[]> = {};
  for (const s of scans) {
    for (const sc of scores.get(s.id) ?? []) {
      if (sc.rawScore === null || sc.concern === "skin_type") continue;
      (series[sc.concern] ??= []).push({ t: s.createdAt.toISOString(), scanId: s.id, raw: sc.rawScore, ui: sc.uiScore, context: s.context });
    }
  }
  const overall = scans.map((s) => ({ t: s.createdAt.toISOString(), score: s.overallScore, skinAge: s.skinAge }));
  return { mode: mode ?? null, series, overall, ...(await thresholdsFor(userId)) };
}

/** Raw-score maps of the latest successful scans (newest first). */
export async function latestScoreMaps(userId: string, n = 2): Promise<{ scan: ScanRow; scores: ScoreMap }[]> {
  const d = await db();
  const rows = await d
    .select()
    .from(schema.scans)
    .where(and(eq(schema.scans.userId, userId), eq(schema.scans.status, "success"), isMeasurement))
    .orderBy(desc(schema.scans.createdAt))
    .limit(n);
  const scores = await scoresFor(rows.map((r) => r.id));
  return rows.map((scan) => ({ scan, scores: toScoreMap(scores.get(scan.id)) }));
}

/** Concerns with the lowest raw scores in the latest scan (= most room to improve). */
export async function weakestConcerns(userId: string, n = 3): Promise<string[]> {
  const [latest] = await latestScoreMaps(userId, 1);
  if (!latest) return [];
  return Object.entries(latest.scores)
    .sort((a, b) => a[1] - b[1])
    .slice(0, n)
    .map(([c]) => c);
}

export function publicScan(s: ScanRow) {
  return {
    id: s.id,
    imageId: s.imageId,
    mode: s.mode,
    status: s.status,
    context: s.context,
    isCalibration: s.isCalibration,
    isMock: s.isMock,
    errorCode: s.errorCode,
    errorMessage: s.status === "error" ? friendlyError(s.errorCode) : null,
    overallScore: s.overallScore,
    skinAge: s.skinAge,
    quality: s.quality,
    createdAt: s.createdAt,
    completedAt: s.completedAt,
  };
}
