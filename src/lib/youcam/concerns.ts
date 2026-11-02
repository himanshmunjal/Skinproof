// YouCam AI Skin Analysis concern catalog (docs.perfectcorp.com/reference/ai_skin_analysis, verified 2026-10-30).
// We store concerns under a mode-independent key (e.g. "redness") so SD and HD results share one vocabulary;
// the scan's `mode` column records which model produced them.

export type ScanMode = "sd" | "hd";

export const CONCERNS = [
  "wrinkle",
  "pore",
  "texture",
  "acne",
  "redness",
  "oiliness",
  "age_spot",
  "radiance",
  "moisture",
  "dark_circle",
  "eye_bag",
  "firmness",
  "droopy_upper_eyelid",
  "droopy_lower_eyelid",
  "tear_trough",
  "skin_type",
] as const;

export type Concern = (typeof CONCERNS)[number];

export const CONCERN_LABELS: Record<Concern, string> = {
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

/** Concerns we score and track over time (skin_type is categorical, not a progress metric). */
export const TRACKED_CONCERNS: Concern[] = CONCERNS.filter((c) => c !== "skin_type");

const SD_ACTION: Record<Concern, string> = {
  wrinkle: "wrinkle",
  pore: "pore",
  texture: "texture",
  acne: "acne",
  redness: "redness",
  oiliness: "oiliness",
  age_spot: "age_spot",
  radiance: "radiance",
  moisture: "moisture",
  dark_circle: "dark_circle_v2",
  eye_bag: "eye_bag",
  firmness: "firmness",
  droopy_upper_eyelid: "droopy_upper_eyelid",
  droopy_lower_eyelid: "droopy_lower_eyelid",
  tear_trough: "tear_trough",
  skin_type: "skin_type",
};

export function dstActions(mode: ScanMode, concerns: readonly Concern[] = CONCERNS): string[] {
  return concerns.map((c) => (mode === "hd" ? `hd_${c}` : SD_ACTION[c]));
}

/** Map a YouCam output `type` (e.g. "hd_redness", "dark_circle_v2") back to our concern key. */
export function concernFromType(type: string): Concern | undefined {
  const base = type.replace(/^hd_/, "").replace(/_v2$/, "");
  return (CONCERNS as readonly string[]).includes(base) ? (base as Concern) : undefined;
}

/** Unit cost per task (charged only on success). V2.0 and V2.1 are identical. */
export function unitCost(mode: ScanMode, nConcerns: number): number {
  const sd = [9, 12, 14, 16];
  const hd = [12, 16, 20, 22];
  const tier = nConcerns <= 4 ? 0 : nConcerns <= 8 ? 1 : nConcerns <= 12 ? 2 : 3;
  return (mode === "hd" ? hd : sd)[tier];
}

export const IMAGE_RULES = {
  sdMinShortSide: 480,
  hdMinShortSide: 1080,
  maxLongSide: 2560,
  maxBytes: 10 * 1024 * 1024,
};

/** Friendly copy for YouCam error codes. */
export const YOUCAM_ERROR_COPY: Record<string, string> = {
  error_src_face_too_small: "Your face is too small in the frame — move closer so it fills the oval.",
  error_src_face_out_of_bound: "Part of your face is outside the photo — center your face in the oval.",
  error_lighting_dark: "The photo is too dark — face a window or turn on a light.",
  error_below_min_image_size: "The photo resolution is too low — use the rear camera or a higher-resolution photo.",
  error_exceed_max_image_size: "The photo is too large — try a smaller image.",
  InvalidParameters: "The analysis request was rejected — please try again.",
};

export function friendlyError(code: string | null | undefined): string {
  if (!code) return "The analysis failed. Please retake the photo.";
  return YOUCAM_ERROR_COPY[code] ?? `The analysis failed (${code}). Please retake the photo.`;
}
