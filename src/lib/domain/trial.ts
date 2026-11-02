import type { TrialVerdict } from "@/lib/db/schema";
import { DEFAULT_THRESHOLD, classifyDelta, confidenceOf, meanScoreMap, round2, signalRatio, type ScoreMap } from "./noise";

// Trial verdict rules (LLD §6.3, DECISION D-05).
export const TRIAL_DAYS = 28;
export const MIN_DAYS_FOR_VERDICT = 14;

export type TrialInput = {
  startAt: Date;
  now: Date;
  targetConcerns: string[];
  /** Raw-score maps of baseline scans (calibration pair or last scans before the trial). */
  baseline: ScoreMap[];
  /** Raw-score maps of check-in scans after the start, newest last. */
  checkins: ScoreMap[];
  thresholds: Record<string, number>;
};

export function evaluateTrial(input: TrialInput): TrialVerdict {
  const day = Math.max(0, Math.floor((input.now.getTime() - input.startAt.getTime()) / 86_400_000));
  const evaluatedAt = input.now.toISOString();
  if (!input.baseline.length || !input.checkins.length) {
    return {
      status: "insufficient_data",
      day,
      perConcern: [],
      recommendation: input.checkins.length ? "We need a baseline scan before the trial started." : "Take your first weekly check-in scan.",
      evaluatedAt,
    };
  }
  const base = meanScoreMap(input.baseline);
  const current = meanScoreMap(input.checkins.slice(-2)); // average the 2 latest check-ins to damp noise
  const perConcern = input.targetConcerns
    .filter((c) => c in base && c in current)
    .map((concern) => {
      const delta = round2(current[concern] - base[concern]);
      const threshold = round2(input.thresholds[concern] ?? DEFAULT_THRESHOLD);
      return {
        concern,
        baseline: base[concern],
        current: current[concern],
        delta,
        threshold,
        label: classifyDelta(delta, threshold),
        ratio: signalRatio(delta, threshold),
        confidence: confidenceOf(delta, threshold),
      };
    });

  if (day < MIN_DAYS_FOR_VERDICT) {
    return {
      status: "too_early",
      day,
      perConcern,
      recommendation: `Day ${day} of ${TRIAL_DAYS}. Skin turnover takes ~4 weeks — keep going and scan weekly.`,
      evaluatedAt,
    };
  }
  if (perConcern.some((c) => c.label === "worse")) {
    return {
      status: "worsening",
      day,
      perConcern,
      recommendation: "Measured worsening beyond your noise band. Stop this product and give your skin 1–2 weeks to settle.",
      evaluatedAt,
    };
  }
  if (perConcern.some((c) => c.label === "improved")) {
    return {
      status: "working",
      day,
      perConcern,
      recommendation:
        day >= TRIAL_DAYS
          ? "Measured improvement beyond noise. Keep it in your routine — and consider sharing a Verified Result."
          : "Early measured improvement. Finish the 28 days to confirm.",
      evaluatedAt,
    };
  }
  return {
    status: "no_change",
    day,
    perConcern,
    recommendation:
      day >= TRIAL_DAYS
        ? "No change beyond measurement noise after 4 weeks. It's probably not worth the money for these concerns."
        : "No measurable change yet. Keep going until day 28 before deciding.",
    evaluatedAt,
  };
}
