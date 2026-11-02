import { describe, expect, it } from "vitest";
import { assessFit, detectActives, findConflicts, normalizeInci, splitInciList } from "@/lib/domain/ingredients";

const ids = (ings: string[]) => detectActives(ings).map((a) => a.active).sort();

describe("INCI parsing", () => {
  it("normalizes names", () => {
    expect(normalizeInci("Water (Aqua)")).toBe("water");
    expect(normalizeInci("Niacinamide 10%*")).toBe("niacinamide");
  });
  it("keeps 1,2-hexanediol intact", () => {
    expect(splitInciList("Ingredients: Water, Glycerin, 1,2-Hexanediol, Niacinamide")).toEqual(["Water", "Glycerin", "1,2-Hexanediol", "Niacinamide"]);
  });
});

describe("active detection", () => {
  it("finds common actives", () => {
    expect(ids(["Aqua", "Niacinamide", "Zinc PCA", "Sodium Hyaluronate"])).toEqual(["hyaluronic", "niacinamide", "zinc"]);
    expect(ids(["Squalane", "Retinol", "Bakuchiol"])).toEqual(["bakuchiol", "retinoid"]);
  });
  it("ignores citric acid used as a late pH adjuster", () => {
    const late = ["Water", "Glycerin", "Butylene Glycol", "Squalane", "Cetearyl Alcohol", "Dimethicone", "Carbomer", "Xanthan Gum", "Citric Acid"];
    expect(ids(late)).toEqual([]);
    expect(ids(["Water", "Glycolic Acid"])).toEqual(["aha"]);
  });
  it("does not confuse zinc oxide (sunscreen) with zinc PCA", () => {
    expect(ids(["Zinc Oxide"])).toEqual(["sunscreen"]);
  });
});

describe("conflicts", () => {
  const retinol = { id: "r", name: "Retinol Serum", slot: "pm" as const, actives: detectActives(["Retinol"]) };
  const glycolic = { id: "g", name: "Glycolic Toner", slot: "pm" as const, actives: detectActives(["Glycolic Acid"]) };
  it("flags retinoid + AHA in the same slot", () => {
    const f = findConflicts([retinol, glycolic]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "conflict", severity: "avoid", slot: "pm" });
  });
  it("no conflict when slots differ", () => {
    expect(findConflicts([retinol, { ...glycolic, slot: "am" }])).toEqual([]);
  });
  it("flags duplicate irritants", () => {
    const f = findConflicts([retinol, { ...retinol, id: "r2", name: "Retinol Cream" }]);
    expect(f[0]).toMatchObject({ kind: "duplicate", severity: "avoid" });
  });
});

describe("pre-purchase fit", () => {
  const shelf = [{ id: "r", name: "Retinol Serum", slot: "pm" as const, actives: detectActives(["Retinol"]) }];
  it("skips duplicates of an irritant already on the shelf", () => {
    const fit = assessFit({ name: "Night Retinal", actives: detectActives(["Retinal"]) }, shelf, ["wrinkle"]);
    expect(fit.verdict).toBe("skip");
  });
  it("buy_with_care when it matches but clashes", () => {
    const fit = assessFit({ name: "AHA Peel", actives: detectActives(["Glycolic Acid"]) }, shelf, ["texture"]);
    expect(fit.verdict).toBe("buy_with_care");
  });
  it("buy when it matches and is clean", () => {
    const fit = assessFit({ name: "Niacinamide 10%", actives: detectActives(["Niacinamide"]) }, shelf, ["redness", "pore"]);
    expect(fit.verdict).toBe("buy");
    expect(fit.matches.map((m) => m.concern)).toEqual(["redness", "pore"]);
  });
  it("not_for_you when it misses weakest concerns", () => {
    const fit = assessFit({ name: "Eye Cream", actives: detectActives(["Caffeine"]) }, [], ["acne"]);
    expect(fit.verdict).toBe("not_for_you");
  });
});
