import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Postgres bytea <-> Node Buffer. Works for both postgres-js and PGlite.
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  toDriver: (v) => v,
  fromDriver: (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v)),
});

export const imageKind = pgEnum("image_kind", ["scan", "mask", "product"]);
export const scanMode = pgEnum("scan_mode", ["sd", "hd"]);
export const scanStatus = pgEnum("scan_status", ["pending", "running", "success", "error"]);
export const scanContext = pgEnum("scan_context", ["routine", "calibration", "checkin", "breakout", "purchase", "validation"]);
export const productSource = pgEnum("product_source", ["photo", "text", "url"]);
export const routineSlot = pgEnum("routine_slot", ["am", "pm", "both", "none"]);
export const trialStatus = pgEnum("trial_status", ["active", "completed", "stopped"]);
export const chatRole = pgEnum("chat_role", ["user", "assistant"]);
export const experimentKind = pgEnum("experiment_kind", ["no_change", "concealer", "flush"]);
export const usageProvider = pgEnum("usage_provider", ["youcam", "claude", "llm"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  isDemo: boolean("is_demo").notNull().default(false),
  displayName: text("display_name"),
  /** Days this user's records were shifted into the past by the dev time-travel tool (DECISION D-34). */
  timeShiftDays: integer("time_shift_days").notNull().default(0),
  createdAt: createdAt(),
});

export const images = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: imageKind("kind").notNull(),
  mime: text("mime").notNull(),
  width: integer("width"),
  height: integer("height"),
  bytes: bytea("bytes").notNull(),
  createdAt: createdAt(),
});

export type CaptureQuality = {
  width: number;
  height: number;
  brightness: number;
  blur: number;
  warnings: string[];
};

export const scans = pgTable(
  "scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    imageId: uuid("image_id").notNull().references(() => images.id, { onDelete: "cascade" }),
    mode: scanMode("mode").notNull(),
    status: scanStatus("status").notNull().default("pending"),
    context: scanContext("context").notNull().default("routine"),
    isCalibration: boolean("is_calibration").notNull().default(false),
    youcamFileId: text("youcam_file_id"),
    youcamTaskId: text("youcam_task_id"),
    errorCode: text("error_code"),
    overallScore: real("overall_score"),
    skinAge: integer("skin_age"),
    quality: jsonb("quality").$type<CaptureQuality>(),
    rawResult: jsonb("raw_result"),
    units: integer("units"),
    isMock: boolean("is_mock").notNull().default(false),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("scans_user_created_idx").on(t.userId, t.createdAt)],
);

export const scanScores = pgTable(
  "scan_scores",
  {
    scanId: uuid("scan_id").notNull().references(() => scans.id, { onDelete: "cascade" }),
    concern: text("concern").notNull(),
    uiScore: integer("ui_score"),
    rawScore: real("raw_score"),
    maskImageId: uuid("mask_image_id").references(() => images.id, { onDelete: "set null" }),
  },
  (t) => [primaryKey({ columns: [t.scanId, t.concern] })],
);

export const noiseProfiles = pgTable(
  "noise_profiles",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    concern: text("concern").notNull(),
    threshold: real("threshold").notNull(),
    nPairs: integer("n_pairs").notNull().default(1),
    sumSqDiff: real("sum_sq_diff").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.concern] })],
);

export type ActiveHit = { active: string; label: string; matched: string; concerns: string[] };

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brand: text("brand"),
    category: text("category"),
    ingredients: jsonb("ingredients").$type<string[]>().notNull().default([]),
    actives: jsonb("actives").$type<ActiveHit[]>().notNull().default([]),
    source: productSource("source").notNull(),
    sourceUrl: text("source_url"),
    imageId: uuid("image_id").references(() => images.id, { onDelete: "set null" }),
    slot: routineSlot("slot").notNull().default("none"),
    onShelf: boolean("on_shelf").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("products_user_idx").on(t.userId)],
);

export type TrialVerdict = {
  status: "too_early" | "working" | "no_change" | "worsening" | "insufficient_data";
  day: number;
  perConcern: {
    concern: string;
    baseline: number;
    current: number;
    delta: number;
    threshold: number;
    label: "improved" | "worse" | "within_noise";
    /** Added in D-36; verdicts stored before that lack them, so clients fall back to |delta| / threshold. */
    ratio?: number;
    confidence?: "noise" | "likely" | "clear";
  }[];
  recommendation: string;
  evaluatedAt: string;
};

export const trials = pgTable(
  "trials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    targetConcerns: jsonb("target_concerns").$type<string[]>().notNull(),
    baselineScanIds: jsonb("baseline_scan_ids").$type<string[]>().notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull().defaultNow(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: trialStatus("status").notNull().default("active"),
    verdict: jsonb("verdict").$type<TrialVerdict>(),
    createdAt: createdAt(),
  },
  (t) => [index("trials_user_status_idx").on(t.userId, t.status)],
);

export const diaryEntries = pgTable(
  "diary_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    sleepHours: real("sleep_hours"),
    stress: integer("stress"),
    waterLiters: real("water_l"),
    newProducts: text("new_products"),
    diet: text("diet"),
    cycleDay: integer("cycle_day"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("diary_user_day_idx").on(t.userId, t.day)],
);

export type ToolTraceItem = { tool: string; input: unknown };

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: chatRole("role").notNull(),
    text: text("text").notNull(),
    toolTrace: jsonb("tool_trace").$type<ToolTraceItem[]>(),
    createdAt: createdAt(),
  },
  (t) => [index("chat_user_created_idx").on(t.userId, t.createdAt)],
);

export const verifiedReviews = pgTable("verified_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  trialId: uuid("trial_id").notNull().references(() => trials.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  body: text("body").notNull(),
  deltas: jsonb("deltas").$type<TrialVerdict["perConcern"]>().notNull(),
  consent: boolean("consent").notNull().default(false),
  createdAt: createdAt(),
});

export const apiUsage = pgTable("api_usage", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  provider: usageProvider("provider").notNull(),
  operation: text("operation").notNull(),
  units: integer("units").notNull().default(0),
  meta: jsonb("meta"),
  createdAt: createdAt(),
});

/**
 * Validation tests (DECISION D-39): a before/after scan pair with a known answer — nothing changed, concealer
 * applied, or skin flushed — used to check that the noise band separates real change from wobble.
 */
export const experiments = pgTable(
  "experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: experimentKind("kind").notNull(),
    beforeScanId: uuid("before_scan_id").notNull().references(() => scans.id, { onDelete: "cascade" }),
    afterScanId: uuid("after_scan_id").references(() => scans.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("experiments_user_idx").on(t.userId)],
);
