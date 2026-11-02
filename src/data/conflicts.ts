/**
 * Deterministic pairing rules between active families (ids from data/actives.ts).
 * Severity:  "avoid"   – don't use in the same routine slot
 *            "caution" – fine for some people; alternate nights or introduce slowly
 * Sources are mainstream dermatology guidance (AAD patient education, product labelling).
 */
export type ConflictRule = {
  a: string;
  b: string;
  severity: "avoid" | "caution";
  why: string;
  fix: string;
};

export const CONFLICT_RULES: ConflictRule[] = [
  {
    a: "retinoid",
    b: "aha",
    severity: "avoid",
    why: "Retinoids and AHAs both increase cell turnover; together they commonly cause irritation and barrier damage.",
    fix: "Use them on alternate nights, or AHA in the morning only if your skin tolerates it.",
  },
  {
    a: "retinoid",
    b: "bha",
    severity: "avoid",
    why: "Stacking a retinoid with salicylic acid often over-exfoliates, especially in the first months.",
    fix: "Alternate nights, or keep BHA to a rinse-off cleanser.",
  },
  {
    a: "retinoid",
    b: "benzoyl_peroxide",
    severity: "avoid",
    why: "Benzoyl peroxide can degrade some retinoids (e.g. tretinoin) and the combination is drying.",
    fix: "Benzoyl peroxide in the morning, retinoid at night (adapalene is the stable exception).",
  },
  {
    a: "vitamin_c",
    b: "aha",
    severity: "caution",
    why: "Low-pH vitamin C plus acids can sting and irritate sensitive skin.",
    fix: "Vitamin C in the morning, acids at night.",
  },
  {
    a: "vitamin_c",
    b: "bha",
    severity: "caution",
    why: "Two low-pH actives in one step can irritate.",
    fix: "Separate them: vitamin C AM, BHA PM.",
  },
  {
    a: "vitamin_c",
    b: "benzoyl_peroxide",
    severity: "avoid",
    why: "Benzoyl peroxide oxidizes vitamin C, making it less effective.",
    fix: "Use them at different times of day.",
  },
  {
    a: "aha",
    b: "bha",
    severity: "caution",
    why: "Two exfoliating acids in one routine raise irritation risk.",
    fix: "Pick one per routine or alternate days.",
  },
  {
    a: "benzoyl_peroxide",
    b: "aha",
    severity: "caution",
    why: "Both are drying; together they often cause flaking.",
    fix: "Alternate, and add a barrier moisturizer (ceramides).",
  },
];

/** Advice that applies to a single active regardless of pairing. */
export const SOLO_ADVICE: Record<string, string> = {
  retinoid: "Retinoids increase sun sensitivity — pair with daily SPF.",
  aha: "AHAs increase sun sensitivity — pair with daily SPF.",
};
