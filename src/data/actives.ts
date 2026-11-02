import type { Concern } from "@/lib/youcam/concerns";

/**
 * INCI alias → active ingredient family → YouCam concerns it is commonly used for.
 * Deliberately conservative: only well-established cosmetic actives. Aliases are matched as
 * whole-phrase substrings of normalized INCI names (see domain/ingredients.normalizeInci).
 */
export type ActiveDef = {
  id: string;
  label: string;
  aliases: string[];
  concerns: Concern[];
  /** Exfoliating/irritating potential — used by conflict rules. */
  irritant?: boolean;
  note?: string;
};

export const ACTIVES: ActiveDef[] = [
  {
    id: "retinoid",
    label: "Retinoid",
    aliases: ["retinol", "retinal", "retinaldehyde", "retinyl palmitate", "retinyl retinoate", "hydroxypinacolone retinoate", "adapalene", "tretinoin", "granactive retinoid"],
    concerns: ["wrinkle", "texture", "acne", "age_spot", "firmness", "pore"],
    irritant: true,
  },
  {
    id: "aha",
    label: "AHA (glycolic/lactic/mandelic)",
    aliases: ["glycolic acid", "lactic acid", "mandelic acid", "malic acid", "tartaric acid", "citric acid"],
    concerns: ["texture", "radiance", "age_spot"],
    irritant: true,
    note: "Citric acid is often only a pH adjuster at low concentration.",
  },
  {
    id: "bha",
    label: "BHA (salicylic acid)",
    aliases: ["salicylic acid", "betaine salicylate", "willow bark extract", "salix alba bark extract"],
    concerns: ["acne", "pore", "oiliness", "texture"],
    irritant: true,
  },
  { id: "pha", label: "PHA (gluconolactone)", aliases: ["gluconolactone", "lactobionic acid"], concerns: ["texture", "moisture"] },
  {
    id: "vitamin_c",
    label: "Vitamin C",
    aliases: ["ascorbic acid", "l-ascorbic acid", "sodium ascorbyl phosphate", "magnesium ascorbyl phosphate", "ascorbyl glucoside", "ethyl ascorbic acid", "3-o-ethyl ascorbic acid", "tetrahexyldecyl ascorbate"],
    concerns: ["radiance", "age_spot", "wrinkle"],
  },
  { id: "niacinamide", label: "Niacinamide", aliases: ["niacinamide", "nicotinamide"], concerns: ["redness", "pore", "oiliness", "age_spot", "texture"] },
  { id: "azelaic", label: "Azelaic acid", aliases: ["azelaic acid", "potassium azeloyl diglycinate"], concerns: ["redness", "acne", "age_spot"] },
  { id: "benzoyl_peroxide", label: "Benzoyl peroxide", aliases: ["benzoyl peroxide"], concerns: ["acne"], irritant: true },
  { id: "hyaluronic", label: "Hyaluronic acid", aliases: ["hyaluronic acid", "sodium hyaluronate", "hydrolyzed hyaluronic acid", "sodium acetylated hyaluronate"], concerns: ["moisture", "wrinkle"] },
  { id: "ceramides", label: "Ceramides", aliases: ["ceramide np", "ceramide ap", "ceramide eop", "ceramide ns", "ceramide eos", "ceramide"], concerns: ["moisture", "redness", "texture"] },
  { id: "peptides", label: "Peptides", aliases: ["palmitoyl tripeptide", "palmitoyl pentapeptide", "acetyl hexapeptide", "copper tripeptide", "palmitoyl tetrapeptide", "matrixyl", "argireline"], concerns: ["firmness", "wrinkle"] },
  { id: "caffeine", label: "Caffeine", aliases: ["caffeine"], concerns: ["eye_bag", "dark_circle"] },
  { id: "zinc", label: "Zinc (PCA/oxide)", aliases: ["zinc pca", "zinc gluconate"], concerns: ["oiliness", "acne"] },
  { id: "centella", label: "Centella asiatica", aliases: ["centella asiatica", "madecassoside", "asiaticoside", "madecassic acid"], concerns: ["redness", "moisture"] },
  { id: "tranexamic", label: "Tranexamic acid", aliases: ["tranexamic acid"], concerns: ["age_spot", "redness"] },
  { id: "alpha_arbutin", label: "Arbutin", aliases: ["alpha-arbutin", "arbutin"], concerns: ["age_spot"] },
  { id: "panthenol", label: "Panthenol", aliases: ["panthenol", "dexpanthenol"], concerns: ["moisture", "redness"] },
  { id: "urea", label: "Urea", aliases: ["urea"], concerns: ["moisture", "texture"] },
  { id: "bakuchiol", label: "Bakuchiol", aliases: ["bakuchiol"], concerns: ["wrinkle", "firmness", "texture"] },
  {
    id: "sunscreen",
    label: "Sunscreen filter",
    aliases: ["zinc oxide", "titanium dioxide", "avobenzone", "butyl methoxydibenzoylmethane", "octinoxate", "ethylhexyl methoxycinnamate", "homosalate", "octocrylene", "bemotrizinol", "bis-ethylhexyloxyphenol methoxyphenyl triazine", "tinosorb", "uvinul", "diethylamino hydroxybenzoyl hexyl benzoate", "ethylhexyl triazone"],
    concerns: ["age_spot", "wrinkle", "redness"],
    note: "Prevention, not correction — effects show over months.",
  },
];
