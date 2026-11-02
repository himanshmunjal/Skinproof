import { z } from "zod";
import { compareScoreMaps } from "@/lib/domain/noise";
import { CONCERN_LABELS, TRACKED_CONCERNS } from "@/lib/youcam/concerns";
import { addDiaryEntry, listDiary } from "@/lib/services/diary";
import { thresholdsFor } from "@/lib/services/noise";
import { checkProduct, listProducts, shelfConflicts } from "@/lib/services/products";
import { listScans, scoresFor, toScoreMap, weakestConcerns } from "@/lib/services/scans";
import { listTrials, startTrial } from "@/lib/services/trials";

// Compact JSON keeps tool results small: free tiers cap tokens per minute.
const json = (v: unknown) => JSON.stringify(v);
const concernEnum = z.enum(TRACKED_CONCERNS as [string, ...string[]]);

/** Human-readable label for each tool, streamed to the UI as the agent works. */
export const TOOL_LABELS: Record<string, string> = {
  get_skin_profile: "Reading your latest scan",
  get_scan_history: "Looking through your scan history",
  compare_scans: "Comparing scans against your noise band",
  get_shelf: "Checking your shelf for clashes",
  check_product: "Analyzing that product's ingredients",
  get_diary: "Reading your skin diary",
  log_diary_entry: "Saving a diary entry",
  list_trials: "Checking your product trials",
  start_trial: "Starting a 28-day trial",
};

/** A provider-neutral tool: Zod validates the model's arguments before `run` sees them. */
export type AgentTool = {
  name: string;
  description: string;
  inputSchema: z.ZodObject;
  run: (input: never) => Promise<string>;
};

function tool<S extends z.ZodObject>(t: { name: string; description: string; inputSchema: S; run: (input: z.infer<S>) => Promise<string> }): AgentTool {
  return t as AgentTool;
}

/** All tools are scoped to one user via closure — the model can never address another user's data. */
export function buildTools(userId: string): AgentTool[] {
  return [
    tool({
      name: "get_skin_profile",
      description:
        "The user's latest successful skin scan: overall score, skin age, per-concern UI scores (1-100, higher = healthier), their 3 weakest concerns, and their personal noise thresholds. Call this first in almost every conversation.",
      inputSchema: z.object({}),
      run: async () => {
        const [latest] = await listScans(userId, { limit: 1, status: "success" });
        const { thresholds, calibrated } = await thresholdsFor(userId);
        if (!latest) return json({ has_scan: false, note: "No scans yet — ask the user to do the 2-photo calibration scan." });
        return json({
          has_scan: true,
          scan_id: latest.id,
          taken_at: latest.createdAt,
          mode: latest.mode,
          overall_score: latest.overallScore,
          skin_age: latest.skinAge,
          scores: Object.fromEntries(latest.scores.filter((s) => s.concern !== "skin_type").map((s) => [s.concern, { ui: s.uiScore, raw: s.rawScore }])),
          weakest_concerns: await weakestConcerns(userId, 3),
          calibrated,
          noise_thresholds_raw_points: thresholds,
        });
      },
    }),
    tool({
      name: "get_scan_history",
      description: "List the user's past successful scans (newest first) with date, context (calibration/checkin/breakout/…) and raw scores. Optionally only one concern.",
      inputSchema: z.object({
        concern: concernEnum.optional().describe("Only return this concern's scores"),
        limit: z.number().int().min(1).max(30).optional(),
      }),
      run: async ({ concern, limit }) => {
        const scans = await listScans(userId, { limit: limit ?? 12, status: "success" });
        return json(
          scans.map((s) => ({
            scan_id: s.id,
            taken_at: s.createdAt,
            context: s.context,
            overall: s.overallScore,
            scores: Object.fromEntries(
              s.scores.filter((x) => x.concern !== "skin_type" && (!concern || x.concern === concern)).map((x) => [x.concern, x.rawScore]),
            ),
          })),
        );
      },
    }),
    tool({
      name: "compare_scans",
      description:
        "Noise-aware comparison of two scans (defaults: latest vs the one before). Each concern is labelled improved / worse / within_noise using the user's personal thresholds. Use this before claiming anything changed.",
      inputSchema: z.object({
        from_scan_id: z.string().optional(),
        to_scan_id: z.string().optional(),
      }),
      run: async ({ from_scan_id, to_scan_id }) => {
        const scans = await listScans(userId, { limit: 30, status: "success" });
        const to = to_scan_id ? scans.find((s) => s.id === to_scan_id) : scans[0];
        const from = from_scan_id ? scans.find((s) => s.id === from_scan_id) : scans.find((s) => to && s.createdAt < to.createdAt && s.mode === to.mode);
        if (!to || !from) return json({ error: "Need two scans to compare." });
        const scores = await scoresFor([from.id, to.id]);
        const { thresholds, calibrated } = await thresholdsFor(userId);
        return json({
          from: { scan_id: from.id, taken_at: from.createdAt },
          to: { scan_id: to.id, taken_at: to.createdAt },
          calibrated,
          comparison: compareScoreMaps(toScoreMap(scores.get(from.id)), toScoreMap(scores.get(to.id)), thresholds),
        });
      },
    }),
    tool({
      name: "get_shelf",
      description: "Products on the user's shelf with routine slot (am/pm/both/none), detected active ingredients, and any conflicts or duplicate actives between products sharing a slot.",
      inputSchema: z.object({}),
      run: async () => {
        const products = await listProducts(userId, { onShelfOnly: true });
        return json({
          products: products.map((p) => ({ product_id: p.id, name: p.name, brand: p.brand, slot: p.slot, actives: p.actives.map((a) => a.label) })),
          conflicts: await shelfConflicts(userId),
        });
      },
    }),
    tool({
      name: "check_product",
      description:
        "Pre-purchase check of a product the user is considering: pass a product page URL or the pasted ingredient list. Returns detected actives, which of the user's weakest concerns it targets, clashes/duplicates with their shelf, and a verdict (buy / buy_with_care / skip / not_for_you). Does not add it to the shelf.",
      inputSchema: z.object({
        url: z.string().optional(),
        ingredients_text: z.string().optional(),
        name: z.string().optional(),
      }),
      run: async ({ url, ingredients_text, name }) => {
        try {
          return json(await checkProduct(userId, { url, text: ingredients_text, name }));
        } catch (err) {
          return json({ error: (err as Error).message });
        }
      },
    }),
    tool({
      name: "get_diary",
      description: "The user's skin diary for the last N days: sleep, stress (1-5), water, new products, diet, cycle day, notes. Use for breakout triage.",
      inputSchema: z.object({ days: z.number().int().min(1).max(90).optional() }),
      run: async ({ days }) => json(await listDiary(userId, days ?? 21)),
    }),
    tool({
      name: "log_diary_entry",
      description: "Save a diary entry for today (or a given YYYY-MM-DD day) from what the user told you. Only include fields the user actually stated.",
      inputSchema: z.object({
        day: z.string().optional(),
        sleep_hours: z.number().optional(),
        stress: z.number().int().min(1).max(5).optional(),
        water_liters: z.number().optional(),
        new_products: z.string().optional(),
        diet: z.string().optional(),
        cycle_day: z.number().int().optional(),
        notes: z.string().optional(),
      }),
      run: async (i) => {
        const row = await addDiaryEntry(userId, {
          day: i.day,
          sleepHours: i.sleep_hours,
          stress: i.stress,
          waterLiters: i.water_liters,
          newProducts: i.new_products,
          diet: i.diet,
          cycleDay: i.cycle_day,
          notes: i.notes,
        });
        return json({ saved: true, id: row.id, day: row.day });
      },
    }),
    tool({
      name: "list_trials",
      description: "The user's 28-day product trials with the current noise-aware verdict (too_early / working / no_change / worsening) per target concern.",
      inputSchema: z.object({}),
      run: async () =>
        json(
          (await listTrials(userId)).map((t) => ({
            trial_id: t.id,
            product: t.product?.name,
            status: t.status,
            target_concerns: t.targetConcerns,
            started: t.startAt,
            ends: t.endAt,
            verdict: t.verdict,
          })),
        ),
    }),
    tool({
      name: "start_trial",
      description:
        "Start a 28-day single-variable trial of a product already on the user's shelf, tracking specific concerns. Only call after the user explicitly agrees. Fails if another trial is active.",
      inputSchema: z.object({
        product_id: z.string(),
        target_concerns: z.array(concernEnum).min(1).max(4),
      }),
      run: async ({ product_id, target_concerns }) => {
        try {
          const t = await startTrial(userId, product_id, target_concerns);
          return json({ started: true, trial_id: t.id, ends: t.endAt, tracking: target_concerns.map((c) => CONCERN_LABELS[c as keyof typeof CONCERN_LABELS]) });
        } catch (err) {
          return json({ error: (err as Error).message });
        }
      },
    }),
  ];
}
