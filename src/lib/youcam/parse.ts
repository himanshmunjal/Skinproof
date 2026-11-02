import { concernFromType } from "./concerns";
import type { ParsedSkinResult, YouCamOutputItem } from "./types";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Normalize `data.results.output[]` into per-concern scores.
 * Overall score and skin age may arrive as their own output items ("all" / "skin_age") — handled if present.
 */
export function parseSkinOutput(output: YouCamOutputItem[]): ParsedSkinResult {
  const result: ParsedSkinResult = { scores: [], overallScore: null, skinAge: null };
  for (const item of output) {
    const type = String(item.type ?? "");
    if (type === "all" || type === "hd_all") {
      result.overallScore = num(item.score) ?? num(item.ui_score) ?? num(item.raw_score);
      continue;
    }
    if (type === "skin_age" || type === "hd_skin_age") {
      result.skinAge = num(item.score) ?? num(item.ui_score) ?? num(item.raw_score);
      continue;
    }
    const concern = concernFromType(type);
    if (!concern) continue;
    const uiScore = num(item.ui_score) === null ? null : Math.round(item.ui_score as number);
    const rawScore = num(item.raw_score);
    const maskUrl = Array.isArray(item.mask_urls) && typeof item.mask_urls[0] === "string" ? item.mask_urls[0] : null;
    // The live API can return several items for one concern (skin_type arrives per zone: whole / T-zone /
    // U-zone). Keep one row per concern: the first scored values and the first mask (DECISION D-33).
    const existing = result.scores.find((s) => s.concern === concern);
    if (existing) {
      if (existing.uiScore === null && existing.rawScore === null) {
        existing.uiScore = uiScore;
        existing.rawScore = rawScore;
      }
      existing.maskUrl ??= maskUrl;
      continue;
    }
    result.scores.push({ concern, uiScore, rawScore, maskUrl });
  }
  // If YouCam didn't send an overall score, use the mean UI score of tracked concerns so the UI always has one.
  if (result.overallScore === null) {
    const ui = result.scores.filter((s) => s.concern !== "skin_type" && s.uiScore !== null).map((s) => s.uiScore!);
    if (ui.length) result.overallScore = Math.round(ui.reduce((a, b) => a + b, 0) / ui.length);
  }
  return result;
}
