import { describe, expect, it } from "vitest";
import { evaluateTrial } from "@/lib/domain/trial";

const start = new Date("2026-10-01T00:00:00Z");
const at = (d: number) => new Date(start.getTime() + d * 86_400_000);
const base = { startAt: start, targetConcerns: ["redness"], baseline: [{ redness: 50 }, { redness: 52 }], thresholds: { redness: 4 } };

describe("trial verdicts", () => {
  it("too early before day 14", () => {
    expect(evaluateTrial({ ...base, now: at(7), checkins: [{ redness: 60 }] }).status).toBe("too_early");
  });
  it("working when beyond the band", () => {
    const v = evaluateTrial({ ...base, now: at(28), checkins: [{ redness: 57 }, { redness: 59 }] });
    expect(v.status).toBe("working");
    expect(v.perConcern[0]).toMatchObject({ baseline: 51, current: 58, delta: 7, label: "improved" });
  });
  it("no_change when within noise", () => {
    expect(evaluateTrial({ ...base, now: at(28), checkins: [{ redness: 53 }] }).status).toBe("no_change");
  });
  it("worsening beats improving on another concern", () => {
    const v = evaluateTrial({
      ...base,
      targetConcerns: ["redness", "pore"],
      baseline: [{ redness: 50, pore: 60 }],
      thresholds: { redness: 4, pore: 4 },
      now: at(21),
      checkins: [{ redness: 60, pore: 50 }],
    });
    expect(v.status).toBe("worsening");
  });
  it("insufficient data without check-ins", () => {
    expect(evaluateTrial({ ...base, now: at(20), checkins: [] }).status).toBe("insufficient_data");
  });
});
