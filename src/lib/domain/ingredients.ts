import { ACTIVES } from "@/data/actives";
import { CONFLICT_RULES, SOLO_ADVICE } from "@/data/conflicts";
import type { ActiveHit } from "@/lib/db/schema";

// Deterministic ingredient engine (LLD §6.4, DECISION D-04). The LLM only extracts the INCI list; everything here
// is plain, testable rules.

export type Slot = "am" | "pm" | "both" | "none";

/** Citric/lactic acid near the end of a list is a pH adjuster, not an exfoliant. */
const PH_ADJUSTER_MIN_POSITION = 8;
const PH_ADJUSTERS = new Set(["citric acid", "lactic acid"]);

export function normalizeInci(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // "Water (Aqua)" → "water"
    .replace(/\d+(\.\d+)?\s*%/g, " ") // "Niacinamide 10%" → "niacinamide"
    .replace(/[*†‡•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a pasted INCI list. Commas followed by a digit are kept ("1,2-Hexanediol"). */
export function splitInciList(text: string): string[] {
  return text
    .replace(/^\s*(ingredients|inci)\s*[:：]/i, "")
    .split(/,(?!\d)|;|\n|•|·/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 120);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function detectActives(ingredients: string[]): ActiveHit[] {
  const normalized = ingredients.map(normalizeInci);
  const hits: ActiveHit[] = [];
  for (const def of ACTIVES) {
    let matched: string | undefined;
    for (const alias of def.aliases) {
      const re = new RegExp(`(^|[^a-z])${escapeRe(alias)}([^a-z]|$)`);
      const idx = normalized.findIndex((ing) => re.test(ing));
      if (idx === -1) continue;
      if (def.id === "aha" && PH_ADJUSTERS.has(alias) && idx >= PH_ADJUSTER_MIN_POSITION) continue;
      matched = ingredients[idx];
      break;
    }
    if (matched) hits.push({ active: def.id, label: def.label, matched, concerns: def.concerns });
  }
  return hits;
}

export type ShelfItem = { id: string; name: string; slot: Slot; actives: ActiveHit[] };

export type ConflictFinding = {
  kind: "conflict" | "duplicate";
  severity: "avoid" | "caution";
  products: { id: string; name: string }[];
  actives: string[];
  slot: "am" | "pm";
  why: string;
  fix: string;
};

const slotsOf = (slot: Slot): ("am" | "pm")[] => (slot === "both" ? ["am", "pm"] : slot === "none" ? [] : [slot]);

/**
 * Conflicts and duplicate actives between products that share a routine slot.
 * Ingredients inside one product are assumed to be formulated to work together.
 */
export function findConflicts(items: ShelfItem[]): ConflictFinding[] {
  const findings: ConflictFinding[] = [];
  const seen = new Set<string>();
  for (const slot of ["am", "pm"] as const) {
    const inSlot = items.filter((p) => slotsOf(p.slot).includes(slot));
    for (let i = 0; i < inSlot.length; i++) {
      for (let j = i + 1; j < inSlot.length; j++) {
        const p = inSlot[i];
        const q = inSlot[j];
        const pa = new Set(p.actives.map((a) => a.active));
        const qa = new Set(q.actives.map((a) => a.active));
        for (const rule of CONFLICT_RULES) {
          if ((pa.has(rule.a) && qa.has(rule.b)) || (pa.has(rule.b) && qa.has(rule.a))) {
            const key = `c:${slot}:${[p.id, q.id].sort().join(",")}:${rule.a}+${rule.b}`;
            if (seen.has(key)) continue;
            seen.add(key);
            findings.push({
              kind: "conflict",
              severity: rule.severity,
              products: [{ id: p.id, name: p.name }, { id: q.id, name: q.name }],
              actives: [rule.a, rule.b],
              slot,
              why: rule.why,
              fix: rule.fix,
            });
          }
        }
        for (const active of pa) {
          if (!qa.has(active) || active === "sunscreen" || active === "hyaluronic" || active === "ceramides" || active === "panthenol") continue;
          const key = `d:${slot}:${[p.id, q.id].sort().join(",")}:${active}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const label = p.actives.find((a) => a.active === active)?.label ?? active;
          findings.push({
            kind: "duplicate",
            severity: ["retinoid", "aha", "bha", "benzoyl_peroxide"].includes(active) ? "avoid" : "caution",
            products: [{ id: p.id, name: p.name }, { id: q.id, name: q.name }],
            actives: [active],
            slot,
            why: `Both products contain ${label} — you are doubling up without extra benefit${["retinoid", "aha", "bha", "benzoyl_peroxide"].includes(active) ? " and with more irritation risk" : ""}.`,
            fix: "Keep the one you are testing; pause the other until the trial ends.",
          });
        }
      }
    }
  }
  const rank = { avoid: 0, caution: 1 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export type FitVerdict = "buy" | "buy_with_care" | "skip" | "not_for_you";

export type ProductFit = {
  verdict: FitVerdict;
  headline: string;
  matches: { concern: string; actives: string[] }[];
  conflicts: ConflictFinding[];
  duplicates: ConflictFinding[];
  advice: string[];
};

/**
 * Pre-purchase fit: does the candidate target the user's weakest concerns, and does it clash with or duplicate
 * what is already on the shelf? The candidate is tested as if used in both AM and PM to surface every clash.
 */
export function assessFit(
  candidate: { name: string; actives: ActiveHit[] },
  shelf: ShelfItem[],
  weakestConcerns: string[],
  labels: Record<string, string> = {},
): ProductFit {
  const cand: ShelfItem = { id: "__candidate__", name: candidate.name, slot: "both", actives: candidate.actives };
  const findings = findConflicts([cand, ...shelf.filter((s) => s.slot !== "none")]).filter((f) =>
    f.products.some((p) => p.id === cand.id),
  );
  // Deduplicate AM/PM copies of the same finding for the candidate.
  const uniq = new Map<string, ConflictFinding>();
  for (const f of findings) uniq.set(`${f.kind}:${f.actives.join("+")}:${f.products.map((p) => p.id).sort().join(",")}`, f);
  const conflicts = [...uniq.values()].filter((f) => f.kind === "conflict");
  const duplicates = [...uniq.values()].filter((f) => f.kind === "duplicate");

  const matches = weakestConcerns
    .map((concern) => ({ concern, actives: candidate.actives.filter((a) => a.concerns.includes(concern as never)).map((a) => a.label) }))
    .filter((m) => m.actives.length > 0);

  const advice = candidate.actives.map((a) => SOLO_ADVICE[a.active]).filter(Boolean) as string[];
  const nice = (c: string) => labels[c] ?? c;

  let verdict: FitVerdict;
  let headline: string;
  if (!candidate.actives.length) {
    verdict = "not_for_you";
    headline = "No recognized active ingredients — this is a basic product, not a treatment.";
  } else if (duplicates.some((d) => d.severity === "avoid")) {
    verdict = "skip";
    const dupLabel = candidate.actives.find((a) => a.active === duplicates[0].actives[0])?.label ?? duplicates[0].actives[0];
    // Keep the label as written: lowercasing or adding "a" breaks acronyms ("a aha").
    headline = `${duplicates[0].products.find((p) => p.id !== cand.id)?.name} on your shelf already contains ${dupLabel}. Doubling up adds irritation, not results.`;
  } else if (!matches.length) {
    verdict = "not_for_you";
    headline = `It doesn't target your weakest areas (${weakestConcerns.map(nice).join(", ")}).`;
  } else if (conflicts.some((c) => c.severity === "avoid") || duplicates.length) {
    verdict = "buy_with_care";
    const c = conflicts[0] ?? duplicates[0];
    headline = `Good match for ${matches.map((m) => nice(m.concern)).join(", ")} — but don't use it in the same routine as ${c.products.find((p) => p.id !== cand.id)?.name}.`;
  } else {
    verdict = "buy";
    headline = `Good match for your ${matches.map((m) => nice(m.concern)).join(", ")}, no clashes with your shelf.`;
  }
  return { verdict, headline, matches, conflicts, duplicates, advice };
}
