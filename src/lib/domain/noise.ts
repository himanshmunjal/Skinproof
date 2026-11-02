// Measurement-noise model (LLD §6.2, DECISION D-03).
// Two scans of the same face minutes apart differ only by noise. From the paired differences d we estimate the
// per-measurement std σ̂ = sqrt(Σd² / 2n). A *change* between two future scans has std √2·σ̂, so the 95% band is
// 1.96·√2·σ̂ = 1.96·sqrt(Σd²/n). With one pair that is simply 1.96·|d|.

export const Z_95 = 1.96;
/** Minimum threshold in raw-score points — YouCam scores are not meaningful below this resolution. */
export const THRESHOLD_FLOOR = 2;
/** Used when a user has not calibrated yet (conservative). */
export const DEFAULT_THRESHOLD = 6;

export type ChangeLabel = "improved" | "worse" | "within_noise";

export function thresholdFromPairs(sumSqDiff: number, nPairs: number): number {
  if (nPairs <= 0) return DEFAULT_THRESHOLD;
  return Math.max(THRESHOLD_FLOOR, Z_95 * Math.sqrt(sumSqDiff / nPairs));
}

/** Higher raw score = healthier (YouCam convention), so a positive delta is an improvement. */
export function classifyDelta(delta: number, threshold: number): ChangeLabel {
  if (delta > threshold) return "improved";
  if (delta < -threshold) return "worse";
  return "within_noise";
}

/**
 * How many noise bands a change spans (|delta| / threshold). The band is a 95% interval, so 1× is the line
 * between "could be noise" and "real"; 2× is far outside anything calibration ever produced (DECISION D-36).
 */
export function signalRatio(delta: number, threshold: number): number {
  return threshold > 0 ? round2(Math.abs(delta) / threshold) : 0;
}

export type Confidence = "noise" | "likely" | "clear";

export function confidenceOf(delta: number, threshold: number): Confidence {
  const r = signalRatio(delta, threshold);
  if (r <= 1) return "noise";
  return r < 2 ? "likely" : "clear";
}

export type ScoreMap = Record<string, number>;

export type ConcernComparison = {
  concern: string;
  before: number;
  after: number;
  delta: number;
  threshold: number;
  label: ChangeLabel;
  /** |delta| in units of the noise band. */
  ratio: number;
  confidence: Confidence;
};

export function compareScoreMaps(before: ScoreMap, after: ScoreMap, thresholds: Record<string, number>): ConcernComparison[] {
  const out: ConcernComparison[] = [];
  for (const concern of Object.keys(after)) {
    if (!(concern in before)) continue;
    const delta = round2(after[concern] - before[concern]);
    const threshold = round2(thresholds[concern] ?? DEFAULT_THRESHOLD);
    out.push({
      concern,
      before: before[concern],
      after: after[concern],
      delta,
      threshold,
      label: classifyDelta(delta, threshold),
      ratio: signalRatio(delta, threshold),
      confidence: confidenceOf(delta, threshold),
    });
  }
  return out.sort((a, b) => Math.abs(b.delta) / b.threshold - Math.abs(a.delta) / a.threshold);
}

/** Element-wise mean of several score maps (only concerns present in all of them). */
export function meanScoreMap(maps: ScoreMap[]): ScoreMap {
  if (!maps.length) return {};
  const keys = Object.keys(maps[0]).filter((k) => maps.every((m) => k in m));
  return Object.fromEntries(keys.map((k) => [k, round2(maps.reduce((s, m) => s + m[k], 0) / maps.length)]));
}

export const round2 = (v: number) => Math.round(v * 100) / 100;
