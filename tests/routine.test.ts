import { describe, expect, it } from "vitest";
import { detectActives, type Slot } from "@/lib/domain/ingredients";
import { inferCategory, planRoutine, type RoutineProduct } from "@/lib/domain/routine";

let n = 0;
const product = (name: string, inci: string[], slot: Slot, category: string | null = null): RoutineProduct => ({
  id: `p${++n}`,
  name,
  category,
  slot,
  actives: detectActives(inci),
});

const retinol = () => product("Retinol 0.5% Serum", ["Squalane", "Retinol"], "pm", "serum");
const glycolic = () => product("Glycolic Toner", ["Aqua", "Glycolic Acid", "Glycerin"], "pm", "exfoliant");
const spf = () => product("Daily Mineral SPF 50", ["Zinc Oxide", "Aqua"], "am", "sunscreen");
const cream = () => product("Barrier Cream", ["Aqua", "Ceramide NP", "Sodium Hyaluronate"], "both", "moisturizer");
const vitc = () => product("Vitamin C Serum", ["Aqua", "Ascorbic Acid"], "am", "serum");
const bpo = () => product("Benzoyl Peroxide Gel", ["Aqua", "Benzoyl Peroxide"], "am", "treatment");

describe("routine planner", () => {
  it("orders steps thinnest to thickest with SPF last", () => {
    const plan = planRoutine([spf(), cream(), vitc()]);
    expect(plan.am.map((s) => s.category)).toEqual(["serum", "moisturizer", "sunscreen"]);
    expect(plan.clashesBefore).toBe(0);
    expect(plan.nights).toHaveLength(1);
  });

  it("splits a retinoid and an AHA onto alternate nights with a recovery night", () => {
    const r = retinol();
    const g = glycolic();
    const plan = planRoutine([r, g, cream(), spf()]);
    expect(plan.clashesBefore).toBe(1);
    expect(plan.clashesAfter).toBe(0);
    expect(plan.nights.map((x) => x.label)).toEqual(expect.arrayContaining(["Retinoid night", "Acid night", "Recovery night"]));
    const nightOf = (id: string) => plan.nights.filter((x) => x.steps.some((s) => s.productId === id)).map((x) => x.key);
    expect(nightOf(r.id)).not.toEqual(expect.arrayContaining(nightOf(g.id)));
    // the moisturizer is used every night, including recovery
    const recovery = plan.nights.find((x) => x.key === "recovery")!;
    expect(recovery.steps.map((s) => s.name)).toEqual(["Barrier Cream"]);
    expect(plan.week).toHaveLength(7);
    expect(plan.week[6].night).toBe(plan.nights.length - 1);
  });

  it("moves a morning retinoid to the night and drops SPF from the night", () => {
    const r = { ...retinol(), slot: "both" as const };
    const s = { ...spf(), slot: "both" as const };
    const plan = planRoutine([r, s]);
    expect(plan.am.map((x) => x.productId)).toEqual([s.id]);
    expect(plan.nights[0].steps.map((x) => x.productId)).toEqual([r.id]);
    expect(plan.moves.map((m) => [m.name, m.to])).toEqual(
      expect.arrayContaining([
        ["Daily Mineral SPF 50", "removed"],
        ["Retinol 0.5% Serum", "pm"],
      ]),
    );
  });

  it("resolves a morning vitamin C + benzoyl peroxide clash by moving benzoyl peroxide, never vitamin C", () => {
    const c = vitc();
    const b = bpo();
    const plan = planRoutine([c, b, spf()]);
    expect(plan.am.some((s) => s.productId === c.id)).toBe(true);
    expect(plan.am.some((s) => s.productId === b.id)).toBe(false);
    expect(plan.moves[0]).toMatchObject({ productId: b.id, from: "am", to: "pm" });
    expect(plan.clashesAfter).toBe(0);
  });

  it("warns when exfoliants are used without a morning SPF", () => {
    const plan = planRoutine([glycolic(), cream()]);
    expect(plan.tips.join(" ")).toMatch(/SPF/);
  });

  it("ignores products marked not in use", () => {
    const plan = planRoutine([{ ...retinol(), slot: "none" }, cream()]);
    expect(plan.nights[0].steps.map((s) => s.name)).toEqual(["Barrier Cream"]);
  });

  it("infers categories from names", () => {
    expect(inferCategory({ name: "Gentle Foaming Cleanser", category: null, actives: [] })).toBe("cleanser");
    expect(inferCategory({ name: "Hydra Gel Cream", category: null, actives: [] })).toBe("moisturizer");
    expect(inferCategory({ name: "Sheer Fluid SPF 30", category: null, actives: [] })).toBe("sunscreen");
    expect(inferCategory({ name: "Mystery Potion", category: null, actives: [] })).toBe("serum");
  });
});
