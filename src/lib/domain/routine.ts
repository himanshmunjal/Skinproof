import { findConflicts, type ShelfItem, type Slot } from "./ingredients";

/**
 * Routine planner (DECISION D-42). Pure and deterministic: takes the shelf, returns a clash-free AM routine,
 * one or more PM "nights" and a 7-day calendar. Clashing PM products are split onto alternate nights with
 * greedy graph colouring over the same conflict rules the shelf uses, so the plan and the clash list never
 * disagree.
 */

export type RoutineProduct = {
  id: string;
  name: string;
  category: string | null;
  slot: Slot;
  actives: { active: string; label: string; matched?: string; concerns?: string[] }[];
};

export type RoutineStep = { productId: string; name: string; step: string; category: string };
export type RoutineNight = { key: string; label: string; steps: RoutineStep[] };
export type RoutineMove = { productId: string; name: string; from: "am" | "pm"; to: "am" | "pm" | "removed"; why: string };
export type RoutinePlan = {
  am: RoutineStep[];
  nights: RoutineNight[];
  /** Mon..Sun → index into `nights`. */
  week: { day: string; night: number }[];
  moves: RoutineMove[];
  tips: string[];
  clashesBefore: number;
  clashesAfter: number;
};

const ORDER: Record<string, { rank: number; step: string }> = {
  cleanser: { rank: 10, step: "Cleanse" },
  toner: { rank: 20, step: "Tone / prep" },
  exfoliant: { rank: 30, step: "Exfoliate" },
  treatment: { rank: 40, step: "Treat" },
  serum: { rank: 50, step: "Serum" },
  other: { rank: 55, step: "Apply" },
  eye: { rank: 60, step: "Eye care" },
  mask: { rank: 65, step: "Mask" },
  moisturizer: { rank: 70, step: "Moisturize" },
  oil: { rank: 80, step: "Seal (oil)" },
  sunscreen: { rank: 90, step: "Protect (SPF)" },
};

const IRRITANT = new Set(["retinoid", "aha", "bha", "benzoyl_peroxide"]);
/** Actives that belong at night: light-sensitive or photosensitising. */
const PREFERS_PM = new Set(["retinoid", "aha", "bha"]);
/** Actives that belong in the morning (antioxidant under SPF). */
const PREFERS_AM = new Set(["vitamin_c", "sunscreen"]);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function inferCategory(p: Pick<RoutineProduct, "name" | "category" | "actives">): string {
  if (p.category && ORDER[p.category]) return p.category;
  const n = p.name.toLowerCase();
  if (/\bspf\b|sunscreen|sun ?shield|sun ?block|\buv\b/.test(n) || p.actives.some((a) => a.active === "sunscreen")) return "sunscreen";
  if (/cleans|face wash|\bwash\b|micellar/.test(n)) return "cleanser";
  if (/peel|exfoli/.test(n)) return "exfoliant";
  if (/toner|toning|tonic|essence|mist/.test(n)) return "toner";
  if (/\beye\b/.test(n)) return "eye";
  if (/mask/.test(n)) return "mask";
  if (/\boil\b/.test(n)) return "oil";
  if (/cream|moistur|lotion|balm|emulsion/.test(n)) return "moisturizer";
  if (/serum|ampoule|booster|drops/.test(n)) return "serum";
  if (/spot|treatment|gel\b/.test(n)) return "treatment";
  return "serum";
}

const has = (p: RoutineProduct, ids: Set<string>) => p.actives.some((a) => ids.has(a.active));
const activeIds = (p: RoutineProduct) => p.actives.map((a) => a.active);

function toStep(p: RoutineProduct): RoutineStep {
  const category = inferCategory(p);
  return { productId: p.id, name: p.name, step: ORDER[category]?.step ?? "Apply", category };
}

function sortSteps(steps: RoutineStep[]): RoutineStep[] {
  return [...steps].sort((a, b) => (ORDER[a.category]?.rank ?? 55) - (ORDER[b.category]?.rank ?? 55) || a.name.localeCompare(b.name));
}

/** Clashes (and irritant doubling) between products used in the same routine step-set. */
function clashCount(products: RoutineProduct[]): number {
  return findConflicts(products.map((p) => ({ id: p.id, name: p.name, slot: "am", actives: p.actives }) as ShelfItem)).filter(
    (f) => f.kind === "conflict" || (f.kind === "duplicate" && f.severity === "avoid"),
  ).length;
}

function clashes(a: RoutineProduct, b: RoutineProduct): boolean {
  return clashCount([a, b]) > 0;
}

export function planRoutine(shelf: RoutineProduct[]): RoutinePlan {
  const used = shelf.filter((p) => p.slot !== "none");
  const clashesBefore = findConflicts(used.map((p) => ({ id: p.id, name: p.name, slot: p.slot, actives: p.actives }) as ShelfItem)).filter(
    (f) => f.kind === "conflict" || (f.kind === "duplicate" && f.severity === "avoid"),
  ).length;

  let am = used.filter((p) => p.slot === "am" || p.slot === "both");
  let pm = used.filter((p) => p.slot === "pm" || p.slot === "both");
  const moves: RoutineMove[] = [];
  const move = (p: RoutineProduct, from: "am" | "pm", to: "am" | "pm" | "removed", why: string) => {
    moves.push({ productId: p.id, name: p.name, from, to, why });
    if (from === "am") am = am.filter((x) => x.id !== p.id);
    else pm = pm.filter((x) => x.id !== p.id);
    if (to === "am" && !am.some((x) => x.id === p.id)) am.push(p);
    if (to === "pm" && !pm.some((x) => x.id === p.id)) pm.push(p);
  };

  // 1. Placement rules.
  for (const p of [...pm]) {
    if (inferCategory(p) === "sunscreen") move(p, "pm", "removed", "SPF only does its job in daylight — skip it at night.");
  }
  for (const p of [...am]) {
    if (has(p, new Set(["retinoid"]))) move(p, "am", "pm", "Retinoids break down in sunlight and raise sun sensitivity — night only.");
  }

  // 2. Morning clashes: move the night-friendly product of each clashing pair to PM.
  for (let guard = 0; guard < 10; guard++) {
    const pair = findPair(am);
    if (!pair) break;
    const [a, b] = pair;
    const score = (p: RoutineProduct) => (has(p, PREFERS_PM) ? 2 : 0) + (has(p, IRRITANT) ? 1 : 0) - (has(p, PREFERS_AM) ? 5 : 0);
    const mover = score(a) >= score(b) ? a : b;
    const other = mover === a ? b : a;
    move(mover, "am", "pm", `Clashes with ${other.name} in the morning — moved to night, where it can get its own evenings.`);
  }

  // 3. Nights: colour the PM clash graph so no two clashing products share an evening.
  const clashing = pm.filter((p) => pm.some((q) => q.id !== p.id && clashes(p, q)));
  const everyNight = pm.filter((p) => !clashing.includes(p));
  const colour = new Map<string, number>();
  const byDegree = [...clashing].sort(
    (a, b) => pm.filter((q) => clashes(b, q)).length - pm.filter((q) => clashes(a, q)).length || a.name.localeCompare(b.name),
  );
  for (const p of byDegree) {
    const taken = new Set(clashing.filter((q) => colour.has(q.id) && clashes(p, q)).map((q) => colour.get(q.id)!));
    let c = 0;
    while (taken.has(c)) c++;
    colour.set(p.id, c);
  }
  const groups = Math.max(1, ...[...colour.values()].map((c) => c + 1));

  const nights: RoutineNight[] = [];
  if (!clashing.length) {
    nights.push({ key: "every", label: "Every night", steps: sortSteps(pm.map(toStep)) });
  } else {
    for (let g = 0; g < groups; g++) {
      const members = clashing.filter((p) => colour.get(p.id) === g);
      const lead = members.flatMap((p) => p.actives).find((a) => IRRITANT.has(a.active)) ?? members[0]?.actives[0];
      nights.push({
        key: `n${g}`,
        label: `${shortActive(lead?.active, lead?.label)} night`,
        steps: sortSteps([...members, ...everyNight].map(toStep)),
      });
    }
    const support = everyNight.filter((p) => !has(p, IRRITANT));
    nights.push({ key: "recovery", label: "Recovery night", steps: sortSteps(support.map(toStep)) });
  }

  const week = DAYS.map((day, i) => {
    if (nights.length === 1) return { day, night: 0 };
    const rotating = nights.length - 1; // last one is recovery
    return { day, night: i === 6 ? rotating : i % rotating };
  });

  // 4. Tips.
  const tips: string[] = [];
  const all = [...am, ...pm];
  const allActives = new Set(all.flatMap(activeIds));
  if (!am.some((p) => inferCategory(p) === "sunscreen") && [...allActives].some((a) => PREFERS_PM.has(a))) {
    tips.push("Your routine has exfoliating or retinoid actives but no morning SPF. Add a broad-spectrum SPF 30+ — otherwise they can leave you more sun-sensitive.");
  }
  if (all.length && !all.some((p) => inferCategory(p) === "moisturizer")) {
    tips.push("No moisturizer on your shelf — a plain barrier cream after actives cuts irritation.");
  }
  if (nights.length > 1) tips.push("Apply thinnest to thickest. On alternate nights, start with 2–3 nights a week and build up if your skin is calm.");

  const clashesAfter = clashCount(am) + nights.reduce((n, night) => n + clashCount(pm.filter((p) => night.steps.some((s) => s.productId === p.id))), 0);

  return { am: sortSteps(am.map(toStep)), nights, week, moves, tips, clashesBefore, clashesAfter };
}

function findPair(list: RoutineProduct[]): [RoutineProduct, RoutineProduct] | null {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (clashes(list[i], list[j])) return [list[i], list[j]];
  return null;
}

function shortActive(id?: string, label?: string): string {
  if (!id) return "Active";
  return ({ retinoid: "Retinoid", aha: "Acid", bha: "BHA", benzoyl_peroxide: "Benzoyl peroxide", vitamin_c: "Vitamin C" } as Record<string, string>)[id] ?? label ?? id;
}
