import OpenAI from "openai";
import { z } from "zod";
import { config } from "@/lib/config";
import { fetchPageText } from "@/lib/fetch-page";
import { recordUsage } from "@/lib/services/usage";

// One client for any OpenAI-compatible provider with a free tier (DECISION D-29). Groq and Gemini both expose
// Chat Completions with function calling, image input and JSON-schema output.

export type LlmProvider = "groq" | "gemini";

// Fallbacks are tried in order when a model is overloaded, rate-limited or times out (DECISION D-32). On
// 2026-10-30 the newest Gemini Flash models answered free-tier calls with 503 "high demand" while
// gemini-3.6-flash / 3.5-flash / 2.5-flash answered in 2-3 s — hence the default and the chain.
const PROVIDERS: Record<LlmProvider, { baseURL: string; model: string; visionModel: string; fallbacks: string[] }> = {
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    visionModel: "qwen/qwen3.8-27b",
    fallbacks: ["openai/gpt-oss-20b"],
  },
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-3.6-flash",
    visionModel: "gemini-3.6-flash",
    fallbacks: ["gemini-3.5-flash", "gemini-2.5-flash"],
  },
};

export class LlmUnavailable extends Error {
  constructor() {
    super("No AI provider configured — set GROQ_API_KEY or GEMINI_API_KEY in .env to enable label reading, URL checks and the coach.");
  }
}

/** Every model in the chain was rate-limited, overloaded or timed out. */
export class LlmRateLimited extends Error {
  constructor() {
    super("The free AI tier is busy or rate-limited right now. Wait a minute and try again.");
  }
}

function resolveProvider(): { provider: LlmProvider; apiKey: string } | undefined {
  const c = config();
  const keys: Record<LlmProvider, string | undefined> = { groq: c.GROQ_API_KEY, gemini: c.GEMINI_API_KEY };
  if (c.LLM_PROVIDER !== "auto") {
    const apiKey = keys[c.LLM_PROVIDER];
    return apiKey ? { provider: c.LLM_PROVIDER, apiKey } : undefined;
  }
  if (keys.groq) return { provider: "groq", apiKey: keys.groq };
  if (keys.gemini) return { provider: "gemini", apiKey: keys.gemini };
  return undefined;
}

let client: OpenAI | undefined;

export function llm(): OpenAI {
  const resolved = resolveProvider();
  if (!resolved) throw new LlmUnavailable();
  // Retries stay low: a busy model is skipped for the next one in the chain instead of waited on.
  client ??= new OpenAI({ apiKey: resolved.apiKey, baseURL: config().LLM_BASE_URL ?? PROVIDERS[resolved.provider].baseURL, maxRetries: 1, timeout: 45_000 });
  return client;
}

export const llmProvider = (): LlmProvider | undefined => resolveProvider()?.provider;
export const llmEnabled = () => Boolean(resolveProvider());
export const llmModel = () => config().LLM_MODEL ?? PROVIDERS[llmProvider() ?? "groq"].model;
export const llmVisionModel = () => config().LLM_VISION_MODEL ?? PROVIDERS[llmProvider() ?? "groq"].visionModel;

/** Overloaded (5xx), rate-limited (429), unknown model (404) or timed out: worth trying the next model. */
function isSkippable(err: unknown): boolean {
  if (err instanceof OpenAI.APIConnectionError) return true; // includes APIConnectionTimeoutError
  return err instanceof OpenAI.APIError && (err.status === 429 || err.status === 404 || (err.status ?? 0) >= 500);
}

/**
 * One chat completion on the first model in the chain that answers. 400s (bad request) are thrown at once;
 * if every model is busy the caller gets LlmRateLimited, which the HTTP layer maps to 503.
 */
export async function complete(
  kind: "text" | "vision",
  params: Omit<OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, "model">,
): Promise<{ res: OpenAI.Chat.ChatCompletion; model: string }> {
  const p = PROVIDERS[llmProvider() ?? "groq"];
  const chain = [...new Set([kind === "vision" ? llmVisionModel() : llmModel(), ...p.fallbacks])];
  for (const model of chain) {
    try {
      return { res: await llm().chat.completions.create({ ...params, model }), model };
    } catch (err) {
      if (!isSkippable(err)) throw err;
      console.warn(`[llm] ${model} unavailable (${err instanceof OpenAI.APIError ? err.status ?? "timeout" : "error"}), trying next model`);
    }
  }
  throw new LlmRateLimited();
}

const CATEGORIES = ["cleanser", "toner", "serum", "moisturizer", "sunscreen", "treatment", "mask", "eye", "exfoliant", "oil", "other"] as const;

export const ProductExtract = z.object({
  found: z.boolean(),
  name: z.string(),
  brand: z.string().nullable(),
  category: z.enum(CATEGORIES).nullable(),
  ingredients: z.array(z.string()),
});
export type ProductExtract = z.infer<typeof ProductExtract>;

// Hand-written so it works under Groq's strict mode (every field required, no extra keys) and Gemini's schema
// subset alike: "unknown" is an empty string instead of a nullable union.
const PRODUCT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "name", "brand", "category", "ingredients"],
  properties: {
    found: { type: "boolean", description: "false if no skincare product / ingredient list could be identified" },
    name: { type: "string", description: "Product name as printed, e.g. 'Niacinamide 10% + Zinc 1%'" },
    brand: { type: "string", description: "Brand as printed, or empty string if unknown" },
    category: { type: "string", enum: [...CATEGORIES, ""], description: "Product type, or empty string if unknown" },
    ingredients: { type: "array", items: { type: "string" }, description: "Full INCI list in printed order, one ingredient per entry, verbatim" },
  },
} as const;

const RawExtract = z.object({
  found: z.boolean().catch(false),
  name: z.string().catch(""),
  brand: z.string().nullish(),
  category: z.string().nullish(),
  ingredients: z.array(z.string()).catch([]),
});

export function toProductExtract(raw: unknown): ProductExtract {
  const r = RawExtract.parse(raw);
  const category = (CATEGORIES as readonly string[]).includes(r.category ?? "") ? (r.category as ProductExtract["category"]) : null;
  const ingredients = r.ingredients.map((i) => i.trim()).filter(Boolean);
  return { found: r.found && ingredients.length > 0, name: r.name.trim() || "Unnamed product", brand: r.brand?.trim() || null, category, ingredients };
}

const EXTRACT_RULES = `Copy the ingredient (INCI) list exactly as printed, in order, one ingredient per array entry.
Never invent or "complete" ingredients you cannot read. If the list is cut off, return only what is legible.
If there is no skincare product or ingredient list, set found=false and leave ingredients empty.
Reply with JSON only: {"found": boolean, "name": string, "brand": string, "category": string, "ingredients": string[]}.`;

async function parseProduct(
  userId: string | undefined,
  operation: string,
  kind: "text" | "vision",
  content: OpenAI.Chat.ChatCompletionUserMessageParam["content"],
): Promise<ProductExtract> {
  const request = (format: OpenAI.Chat.ChatCompletionCreateParams["response_format"]) =>
    complete(kind, { temperature: 0, messages: [{ role: "user", content }], response_format: format });

  let out: Awaited<ReturnType<typeof complete>>;
  try {
    out = await request({ type: "json_schema", json_schema: { name: "product", strict: true, schema: PRODUCT_JSON_SCHEMA } });
  } catch (err) {
    // Some models on a provider support only JSON mode; the schema is repeated in the prompt for them.
    if (!(err instanceof OpenAI.BadRequestError)) throw err;
    out = await request({ type: "json_object" });
  }
  const { res, model } = out;
  await recordUsage({
    userId,
    provider: "llm",
    operation,
    units: 0,
    meta: { provider: llmProvider(), model, input_tokens: res.usage?.prompt_tokens, output_tokens: res.usage?.completion_tokens },
  });
  const text = res.choices[0]?.message.content ?? "";
  try {
    return toProductExtract(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")));
  } catch {
    throw new Error("Couldn't read a product from that input.");
  }
}

/** Product label / back-of-pack photo → structured product. */
export async function extractFromLabelPhoto(userId: string, jpeg: Buffer): Promise<ProductExtract> {
  return parseProduct(userId, "extract:photo", "vision", [
    { type: "text", text: `This is a photo of a skincare product's packaging. Extract the product name, brand, category and ingredient list.\n${EXTRACT_RULES}` },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } },
  ]);
}

/** Product page URL → structured product. The page is fetched by this server with SSRF guards (DECISION D-30). */
export async function extractFromUrl(userId: string, url: string): Promise<ProductExtract> {
  llm(); // fail on a missing key before fetching anything
  const text = await fetchPageText(url);
  if (!text.trim()) throw new Error("Couldn't read that page. Paste the ingredient list instead.");
  return parseProduct(userId, "extract:url", "text", `Below is text copied from a product page (${url}).\n${EXTRACT_RULES}\n\n<page>\n${text}\n</page>`);
}
