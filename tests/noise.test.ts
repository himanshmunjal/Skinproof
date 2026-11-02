import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLD, THRESHOLD_FLOOR, classifyDelta, compareScoreMaps, meanScoreMap, thresholdFromPairs } from "@/lib/domain/noise";

describe("noise model", () => {
  it("one calibration pair → 1.96·|d|", () => {
    expect(thresholdFromPairs(3 * 3, 1)).toBeCloseTo(1.96 * 3);
  });
  it("pools several pairs", () => {
    // d = 2 and 4 → sqrt((4+16)/2) = sqrt(10)
    expect(thresholdFromPairs(4 + 16, 2)).toBeCloseTo(1.96 * Math.sqrt(10));
  });
  it("never goes below the floor, defaults when uncalibrated", () => {
    expect(thresholdFromPairs(0, 1)).toBe(THRESHOLD_FLOOR);
    expect(thresholdFromPairs(0, 0)).toBe(DEFAULT_THRESHOLD);
  });
  it("classifies deltas against the band (higher = healthier)", () => {
    expect(classifyDelta(5, 4)).toBe("improved");
    expect(classifyDelta(-5, 4)).toBe("worse");
    expect(classifyDelta(3.9, 4)).toBe("within_noise");
  });
  it("compares maps and sorts by significance", () => {
    const res = compareScoreMaps({ redness: 50, pore: 60 }, { redness: 58, pore: 61 }, { redness: 4, pore: 4 });
    expect(res[0]).toMatchObject({ concern: "redness", delta: 8, label: "improved" });
    expect(res[1]).toMatchObject({ concern: "pore", label: "within_noise" });
  });
  it("means only shared keys", () => {
    expect(meanScoreMap([{ a: 1, b: 2 }, { a: 3 }])).toEqual({ a: 2 });
  });
});
