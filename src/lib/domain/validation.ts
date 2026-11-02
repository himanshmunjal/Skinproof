import type { ConcernComparison } from "./noise";

// Validation tests (LLD §6.6, DECISION D-39). Each test is a before/after scan pair whose right answer is known in
// advance, so the user — or a judge — can check the noise band against reality instead of taking it on faith.

export type ExperimentKind = "no_change" | "concealer" | "flush";

export type ExperimentSpec = {
  title: string;
  /** What to do between the two photos. */
  between: string;
  /** What a working noise band should report. */
  expectation: string;
  /** Concerns that must move, and in which direction. Empty = nothing may move. */
  expected: string[];
  direction: "improved" | "worse" | null;
};

export const EXPERIMENTS: Record<ExperimentKind, ExperimentSpec> = {
  no_change: {
    title: "Nothing changed",
    between: "Change nothing. Step out of frame, wait a minute, come back to the same spot and pose.",
    expectation: "Every concern should stay inside its noise band — about 95% of readings, by construction.",
    expected: [],
    direction: null,
  },
  concealer: {
    title: "Concealer",
    between: "Apply concealer under your eyes and over any red or dark spots. Same spot, same light.",
    expectation: "Dark circles, redness or spots should come out improved — beyond the band.",
    expected: ["dark_circle", "redness", "age_spot"],
    direction: "improved",
  },
  flush: {
    title: "Flushed skin",
    between: "Wash with warm water and rub gently, or do a minute of jumping jacks, then retake right away.",
    expectation: "Redness should come out worse — beyond the band.",
    expected: ["redness"],
    direction: "worse",
  },
};

export type ExperimentResult = {
  passed: boolean;
  /** Concern readings in the comparison / of them inside the band. */
  readings: number;
  inBand: number;
  /** Expected concerns that moved the expected way (positive tests only). */
  detected: string[];
  summary: string;
};

/** With 95% bands, ~1 in 20 unchanged readings falls outside by chance; allow that before calling a test failed. */
export function allowedOutliers(readings: number): number {
  return Math.max(1, Math.round(readings * 0.1));
}

export function evaluateExperiment(kind: ExperimentKind, comparison: ConcernComparison[]): ExperimentResult {
  const spec = EXPERIMENTS[kind];
  const readings = comparison.length;
  const inBand = comparison.filter((c) => c.label === "within_noise").length;
  if (spec.direction === null) {
    const outside = readings - inBand;
    const passed = outside <= allowedOutliers(readings);
    return {
      passed,
      readings,
      inBand,
      detected: [],
      summary: passed
        ? `${inBand} of ${readings} readings stayed inside the band — no false "progress".`
        : `${outside} of ${readings} readings left the band with nothing changed — the band is too tight. Add another calibration pair.`,
    };
  }
  const detected = comparison.filter((c) => spec.expected.includes(c.concern) && c.label === spec.direction).map((c) => c.concern);
  return {
    passed: detected.length > 0,
    readings,
    inBand,
    detected,
    summary: detected.length
      ? `Detected: ${detected.length} expected concern${detected.length > 1 ? "s" : ""} moved beyond the band.`
      : "The expected change stayed inside the band — too subtle to measure, or the band is too wide.",
  };
}

export type ValidationSummary = {
  /** Unchanged readings that stayed in band, across all "nothing changed" tests. */
  nullReadings: number;
  nullInBand: number;
  /** Positive tests (concealer, flush) and how many detected the change. */
  positiveTests: number;
  positiveDetected: number;
};

export function summarize(results: { kind: ExperimentKind; result: ExperimentResult }[]): ValidationSummary {
  const s: ValidationSummary = { nullReadings: 0, nullInBand: 0, positiveTests: 0, positiveDetected: 0 };
  for (const { kind, result } of results) {
    if (EXPERIMENTS[kind].direction === null) {
      s.nullReadings += result.readings;
      s.nullInBand += result.inBand;
    } else {
      s.positiveTests++;
      if (result.passed) s.positiveDetected++;
    }
  }
  return s;
}
