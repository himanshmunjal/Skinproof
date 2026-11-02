import { z } from "zod";

// Single source of truth for configuration. Parsed lazily so `next build` works without secrets.
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const EnvSchema = z.object({
  APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  YOUCAM_API_KEY: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  YOUCAM_BASE_URL: z.string().url().default("https://yce-api-01.makeupar.com"),
  YOUCAM_MOCK: z
    .string()
    .optional()
    .transform((v) => (v ?? "").toLowerCase() === "true"),
  YOUCAM_MODE: z.enum(["auto", "sd", "hd"]).default("auto"),
  YOUCAM_UNIT_BUDGET: z.coerce.number().int().positive().default(1000),
  /** Public-deployment guards (DECISION D-37): live YouCam scans and AI calls per user per day. 0 = unlimited. */
  SCANS_PER_USER_PER_DAY: z.coerce.number().int().min(0).default(10),
  AI_CALLS_PER_USER_PER_DAY: z.coerce.number().int().min(0).default(60),
  // LLM: any OpenAI-compatible provider with a free tier (DECISION D-29). "auto" picks whichever key is set.
  /** Dev-only: allow "skip ahead N days" so trials can be exercised without waiting (DECISION D-34). */
  DEV_TIME_TRAVEL: z
    .string()
    .optional()
    .transform((v) => (v ?? "").toLowerCase() === "true"),
  LLM_PROVIDER: z.enum(["auto", "groq", "gemini"]).default("auto"),
  GROQ_API_KEY: optionalString,
  GEMINI_API_KEY: optionalString,
  /** Override the provider's default chat/agent model. */
  LLM_MODEL: optionalString,
  /** Override the provider's default vision model (label photos). */
  LLM_VISION_MODEL: optionalString,
  /** Override the provider's endpoint (any OpenAI-compatible server, e.g. a local test double). */
  LLM_BASE_URL: optionalString,
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  /** True when YouCam calls are served by the mock client (explicitly, or because no key is set). */
  youcamUseMock: boolean;
};

let cached: AppConfig | undefined;

export function config(): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example`);
  }
  cached = { ...parsed.data, youcamUseMock: parsed.data.YOUCAM_MOCK || !parsed.data.YOUCAM_API_KEY };
  return cached;
}
