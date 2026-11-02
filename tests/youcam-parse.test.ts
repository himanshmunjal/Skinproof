import { describe, expect, it } from "vitest";
import { concernFromType, dstActions, parseSkinOutput, unitCost } from "@/lib/youcam";

describe("YouCam mapping", () => {
  it("maps action names both ways", () => {
    expect(dstActions("hd", ["redness", "dark_circle"])).toEqual(["hd_redness", "hd_dark_circle"]);
    expect(dstActions("sd", ["dark_circle"])).toEqual(["dark_circle_v2"]);
    expect(concernFromType("hd_redness")).toBe("redness");
    expect(concernFromType("dark_circle_v2")).toBe("dark_circle");
    expect(concernFromType("nonsense")).toBeUndefined();
  });
  it("unit costs match the docs table", () => {
    expect(unitCost("sd", 16)).toBe(16);
    expect(unitCost("hd", 16)).toBe(22);
    expect(unitCost("hd", 4)).toBe(12);
  });
  it("parses the documented output sample", () => {
    // Shape from docs.perfectcorp.com AI Skin Analysis, step 7.
    const parsed = parseSkinOutput([
      { type: "texture", ui_score: 68, raw_score: 57.33, mask_urls: ["https://example/texture_output.jpg"] },
      { type: "hd_redness", ui_score: 71, raw_score: 61.2, mask_urls: [] },
      { type: "all", score: 70 },
      { type: "skin_age", score: 29 },
    ]);
    expect(parsed.scores).toEqual([
      { concern: "texture", uiScore: 68, rawScore: 57.33, maskUrl: "https://example/texture_output.jpg" },
      { concern: "redness", uiScore: 71, rawScore: 61.2, maskUrl: null },
    ]);
    expect(parsed.overallScore).toBe(70);
    expect(parsed.skinAge).toBe(29);
  });
  it("falls back to mean UI score when no overall score is sent", () => {
    expect(parseSkinOutput([{ type: "pore", ui_score: 60 }, { type: "acne", ui_score: 70 }]).overallScore).toBe(65);
  });

  it("merges several items for one concern into a single row (live skin_type arrives per zone)", () => {
    const r = parseSkinOutput([
      { type: "hd_skin_type", mask_urls: ["https://x/whole.png"] },
      { type: "hd_skin_type", mask_urls: ["https://x/tzone.png"] },
      { type: "hd_pore", ui_score: 70, raw_score: 61.2, mask_urls: [] },
      { type: "hd_pore", ui_score: 50, raw_score: 40, mask_urls: ["https://x/pore-nose.png"] },
    ]);
    expect(r.scores.filter((s) => s.concern === "skin_type")).toEqual([{ concern: "skin_type", uiScore: null, rawScore: null, maskUrl: "https://x/whole.png" }]);
    expect(r.scores.filter((s) => s.concern === "pore")).toEqual([{ concern: "pore", uiScore: 70, rawScore: 61.2, maskUrl: "https://x/pore-nose.png" }]);
  });
});
