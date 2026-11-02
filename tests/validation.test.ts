import { describe, expect, it } from "vitest";
import { compareScoreMaps, confidenceOf, signalRatio } from "@/lib/domain/noise";
import { allowedOutliers, evaluateExperiment, summarize } from "@/lib/domain/validation";

const bands = { redness: 4, dark_circle: 4, pore: 4, texture: 4 };

describe("change strength", () => {
  it("measures change in noise bands", () => {
    expect(signalRatio(-8, 4)).toBe(2);
    expect(confidenceOf(3, 4)).toBe("noise");
    expect(confidenceOf(4, 4)).toBe("noise"); // on the band edge is still noise, matching classifyDelta
    expect(confidenceOf(6, 4)).toBe("likely");
    expect(confidenceOf(-9, 4)).toBe("clear");
  });
  it("is attached to every comparison", () => {
    const [c] = compareScoreMaps({ redness: 50 }, { redness: 60 }, bands);
    expect(c).toMatchObject({ ratio: 2.5, confidence: "clear" });
  });
});

describe("validation tests", () => {
  it("no-change test passes when readings stay in band", () => {
    const cmp = compareScoreMaps({ redness: 50, pore: 60, texture: 70 }, { redness: 51, pore: 58, texture: 70 }, bands);
    const r = evaluateExperiment("no_change", cmp);
    expect(r).toMatchObject({ passed: true, readings: 3, inBand: 3 });
  });
  it("no-change test tolerates the expected chance outlier but not more", () => {
    expect(allowedOutliers(15)).toBe(2);
    const cmp = compareScoreMaps({ redness: 50, pore: 60, texture: 70 }, { redness: 60, pore: 50, texture: 80 }, bands);
    expect(evaluateExperiment("no_change", cmp).passed).toBe(false);
  });
  it("concealer test needs an expected concern to improve", () => {
    const hit = compareScoreMaps({ dark_circle: 40, pore: 60 }, { dark_circle: 52, pore: 60 }, bands);
    expect(evaluateExperiment("concealer", hit)).toMatchObject({ passed: true, detected: ["dark_circle"] });
    // Pores improving doesn't count: concealer doesn't target them.
    const miss = compareScoreMaps({ dark_circle: 40, pore: 60 }, { dark_circle: 41, pore: 70 }, bands);
    expect(evaluateExperiment("concealer", miss).passed).toBe(false);
  });
  it("flush test needs redness to get worse", () => {
    const worse = compareScoreMaps({ redness: 60 }, { redness: 50 }, bands);
    expect(evaluateExperiment("flush", worse).passed).toBe(true);
    const better = compareScoreMaps({ redness: 50 }, { redness: 60 }, bands);
    expect(evaluateExperiment("flush", better).passed).toBe(false);
  });
  it("summarizes across tests", () => {
    const ok = compareScoreMaps({ redness: 50, pore: 60 }, { redness: 51, pore: 60 }, bands);
    const flush = compareScoreMaps({ redness: 60 }, { redness: 50 }, bands);
    expect(
      summarize([
        { kind: "no_change", result: evaluateExperiment("no_change", ok) },
        { kind: "flush", result: evaluateExperiment("flush", flush) },
        { kind: "concealer", result: evaluateExperiment("concealer", ok) },
      ]),
    ).toEqual({ nullReadings: 2, nullInBand: 2, positiveTests: 2, positiveDetected: 1 });
  });
});
