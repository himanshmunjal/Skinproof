import { confidenceOf, signalRatio, type Confidence } from "@/lib/domain/noise";

// Client-safe copy of concern labels (avoids importing server modules into client bundles).
export const LABELS: Record<string, string> = {
  wrinkle: "Wrinkles",
  pore: "Pores",
  texture: "Texture",
  acne: "Acne",
  redness: "Redness",
  oiliness: "Oiliness",
  age_spot: "Spots",
  radiance: "Radiance",
  moisture: "Moisture",
  dark_circle: "Dark circles",
  eye_bag: "Eye bags",
  firmness: "Firmness",
  droopy_upper_eyelid: "Upper eyelid",
  droopy_lower_eyelid: "Lower eyelid",
  tear_trough: "Tear trough",
  skin_type: "Skin type",
};

export const label = (c: string) => LABELS[c] ?? c;

export const TRACKED = Object.keys(LABELS).filter((c) => c !== "skin_type");

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Plain-language strength of a change, in units of the user's own noise band (DECISION D-36). */
export function strength(delta: number, threshold: number): { level: Confidence; ratio: number; text: string } {
  const level = confidenceOf(delta, threshold);
  const ratio = signalRatio(delta, threshold);
  const x = `${ratio.toFixed(1)}× your normal wobble`;
  const text =
    level === "noise"
      ? `Within your noise band (${x}) — can't be told apart from photo-to-photo variation.`
      : level === "likely"
        ? `Likely real — ${x}.`
        : `Clear change — ${x}.`;
  return { level, ratio, text };
}
