import "dotenv/config";
import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { closeDb, db, schema } from "@/lib/db/client";
import { detectActives } from "@/lib/domain/ingredients";
import { evaluateTrial, TRIAL_DAYS } from "@/lib/domain/trial";
import { recomputeNoiseProfile, thresholdsFor } from "@/lib/services/noise";
import { DEMO_USER_ID } from "@/lib/services/users";
import { MockYouCamClient } from "@/lib/youcam/mock";
import { TRACKED_CONCERNS } from "@/lib/youcam/concerns";

/**
 * Seeds a clearly-labelled demo account (and a few anonymous "community" reviewers) so the full 28-day story can
 * be shown in a 3-minute video. All brands are fictional. Re-running replaces the previous demo data.
 */

const DAY = 86_400_000;
const now = Date.now();
const at = (daysAgo: number, minutes = 0) => new Date(now - daysAgo * DAY + minutes * 60_000);

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

const BASE: Record<string, number> = {
  wrinkle: 74, pore: 56, texture: 62, acne: 60, redness: 52, oiliness: 50, age_spot: 70, radiance: 59,
  moisture: 57, dark_circle: 54, eye_bag: 66, firmness: 72, droopy_upper_eyelid: 80, droopy_lower_eyelid: 78, tear_trough: 69,
};
// Photo-to-photo difference of the calibration pair per concern (raw points). 1.96 × these = the noise bands.
const CAL_DIFF: Record<string, number> = {
  wrinkle: 1.6, pore: 1.8, texture: 2.2, acne: 2.0, redness: 1.9, oiliness: 1.7, age_spot: 1.5, radiance: 2.1,
  moisture: 2.4, dark_circle: 1.6, eye_bag: 1.8, firmness: 1.5, droopy_upper_eyelid: 1.4, droopy_lower_eyelid: 1.4, tear_trough: 2.3,
};
// Trial product (niacinamide) improves redness & pores over 4 weeks; everything else only wobbles.
const TREND: Record<string, number> = { redness: 9, pore: 6.5, oiliness: 3 };

const PRODUCTS = [
  { name: "Niacinamide 10% + Zinc 1% Serum", brand: "Lumen Lab", category: "serum", slot: "both" as const, inci: "Aqua, Niacinamide, Pentylene Glycol, Zinc PCA, Dimethyl Isosorbide, Tamarindus Indica Seed Gum, Xanthan Gum, Isoceteth-20, Ethoxydiglycol, Phenoxyethanol, Chlorphenesin" },
  { name: "Retinol 0.5% in Squalane", brand: "Dermaform", category: "serum", slot: "pm" as const, inci: "Squalane, Caprylic/Capric Triglyceride, Retinol, Solanum Lycopersicum Seed Oil, Rosmarinus Officinalis Leaf Extract, BHT" },
  { name: "Glycolic Acid 7% Toning Solution", brand: "Clearwave", category: "exfoliant", slot: "pm" as const, inci: "Aqua, Glycolic Acid, Rosa Damascena Flower Water, Glycerin, Aloe Barbadensis Leaf Water, Sodium Hydroxide, Panthenol, Tasmannia Lanceolata Fruit Extract" },
  { name: "Daily Mineral Shield SPF 50", brand: "Solace", category: "sunscreen", slot: "am" as const, inci: "Aqua, Zinc Oxide, Caprylic/Capric Triglyceride, Glycerin, Niacinamide, Tocopherol, Polyhydroxystearic Acid" },
  { name: "Barrier Cream", brand: "Hydrae", category: "moisturizer", slot: "both" as const, inci: "Aqua, Glycerin, Cetearyl Alcohol, Caprylic/Capric Triglyceride, Ceramide NP, Ceramide AP, Ceramide EOP, Phytosphingosine, Cholesterol, Sodium Hyaluronate" },
];

async function demoPortrait(): Promise<Buffer> {
  // Abstract placeholder portrait (no real person) — labelled DEMO.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440">
    <defs><radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#e9e1d8"/><stop offset="1" stop-color="#b9aa9b"/></radialGradient>
    <radialGradient id="skin" cx="45%" cy="40%" r="70%"><stop offset="0" stop-color="#e8b996"/><stop offset="1" stop-color="#c98f6c"/></radialGradient></defs>
    <rect width="1080" height="1440" fill="url(#bg)"/>
    <path d="M190 1440 C 220 1150 380 1060 540 1060 C 700 1060 860 1150 890 1440 Z" fill="#5b6b73"/>
    <rect x="455" y="930" width="170" height="170" rx="60" fill="#c98f6c"/>
    <ellipse cx="540" cy="640" rx="345" ry="450" fill="url(#skin)"/>
    <path d="M200 520 C 220 200 860 200 880 520 C 820 330 260 330 200 520 Z" fill="#3b2a22"/>
    <ellipse cx="410" cy="610" rx="48" ry="22" fill="#fff"/><circle cx="410" cy="610" r="17" fill="#3b2a22"/>
    <ellipse cx="670" cy="610" rx="48" ry="22" fill="#fff"/><circle cx="670" cy="610" r="17" fill="#3b2a22"/>
    <path d="M350 548 Q 410 520 470 548" stroke="#3b2a22" stroke-width="12" fill="none" stroke-linecap="round"/>
    <path d="M610 548 Q 670 520 730 548" stroke="#3b2a22" stroke-width="12" fill="none" stroke-linecap="round"/>
    <path d="M540 640 Q 520 760 500 790 Q 540 812 580 790" stroke="#a96f50" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M455 900 Q 540 945 625 900" stroke="#9c4f45" stroke-width="14" fill="none" stroke-linecap="round"/>
    <text x="540" y="1380" font-family="Helvetica, Arial" font-size="54" font-weight="700" text-anchor="middle" fill="#ffffff" opacity="0.85">DEMO DATA</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

async function main() {
  const d = await db();
  const mock = new MockYouCamClient();

  // Wipe previous demo + community users (cascade removes everything they own).
  const old = await d.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.isDemo, true));
  if (old.length) await d.delete(schema.users).where(inArray(schema.users.id, old.map((u) => u.id)));

  await d.insert(schema.users).values({ id: DEMO_USER_ID, isDemo: true, displayName: "Demo" });
  const portrait = await demoPortrait();
  const [img] = await d.insert(schema.images).values({ userId: DEMO_USER_ID, kind: "scan", mime: "image/jpeg", width: 1080, height: 1440, bytes: portrait }).returning();

  // Scan timeline: calibration pair 31 days ago, weekly check-ins during the 28-day trial, and a breakout scan yesterday.
  const timeline = [
    { daysAgo: 31, minutes: 0, context: "calibration" as const, progress: 0 },
    { daysAgo: 31, minutes: 2, context: "calibration" as const, progress: 0 },
    { daysAgo: 23, minutes: 0, context: "checkin" as const, progress: 0.25 },
    { daysAgo: 16, minutes: 0, context: "checkin" as const, progress: 0.5 },
    { daysAgo: 9, minutes: 0, context: "checkin" as const, progress: 0.8 },
    { daysAgo: 2, minutes: 0, context: "checkin" as const, progress: 1 },
  ];
  const maskCache = new Map<string, string>();
  const scanIds: string[] = [];
  for (const t of timeline) {
    const createdAt = at(t.daysAgo, t.minutes);
    const scanIdx = timeline.indexOf(t);
    const scores = TRACKED_CONCERNS.map((c, ci) => {
      // Deterministic demo: the calibration pair differs by a fixed, realistic amount per concern (→ bands ≈ ±3–5),
      // centred on BASE; check-ins add only a small fixed jitter, plus the trend for the trial's target concerns.
      const half = CAL_DIFF[c] / 2;
      const jitter = t.context === "calibration" ? (t.minutes === 0 ? half : -half) : Math.sin((ci + 1) * (scanIdx + 2) * 1.7) * 0.8;
      const raw = Math.min(99, Math.max(1, BASE[c] + (TREND[c] ?? 0) * t.progress + jitter));
      return { concern: c, raw: Math.round(raw * 100) / 100, ui: Math.round(Math.min(100, raw * 0.75 + 22)) };
    });
    const overall = Math.round(scores.reduce((s, x) => s + x.ui, 0) / scores.length);
    const [scan] = await d
      .insert(schema.scans)
      .values({
        userId: DEMO_USER_ID,
        imageId: img.id,
        mode: "hd",
        status: "success",
        context: t.context,
        isCalibration: t.context === "calibration",
        overallScore: overall,
        skinAge: Math.round(31 - t.progress * 1.5),
        quality: { width: 1080, height: 1440, brightness: 142, blur: 180, warnings: [] },
        rawResult: { demo: true },
        units: 0,
        isMock: true,
        createdAt,
        completedAt: createdAt,
      })
      .returning();
    scanIds.push(scan.id);
    for (const s of scores) {
      let maskId = maskCache.get(s.concern);
      if (!maskId) {
        const m = await mock.download(`mock://mask/${s.concern}/1080x1440/demo`);
        const [mi] = await d.insert(schema.images).values({ userId: DEMO_USER_ID, kind: "mask", mime: m.mime, width: 1080, height: 1440, bytes: m.bytes }).returning();
        maskId = mi.id;
        maskCache.set(s.concern, maskId);
      }
      await d.insert(schema.scanScores).values({ scanId: scan.id, concern: s.concern, uiScore: s.ui, rawScore: s.raw, maskImageId: maskId });
    }
    await d.insert(schema.scanScores).values({ scanId: scan.id, concern: "skin_type", uiScore: null, rawScore: null });
  }
  await recomputeNoiseProfile(DEMO_USER_ID);

  // Shelf (retinol + glycolic in PM → deliberate clash for the demo).
  const productIds: Record<string, string> = {};
  for (const [i, p] of PRODUCTS.entries()) {
    const ingredients = p.inci.split(/,\s*/);
    const [row] = await d
      .insert(schema.products)
      .values({
        userId: DEMO_USER_ID,
        name: p.name,
        brand: p.brand,
        category: p.category,
        ingredients,
        actives: detectActives(ingredients),
        source: "text",
        slot: p.slot,
        createdAt: at(40 - i),
      })
      .returning();
    productIds[p.name] = row.id;
  }

  // Completed niacinamide trial.
  const niaId = productIds[PRODUCTS[0].name];
  const startAt = at(30);
  const { thresholds } = await thresholdsFor(DEMO_USER_ID);
  const scoreRows = await d.select().from(schema.scanScores).where(inArray(schema.scanScores.scanId, scanIds));
  const mapOf = (id: string) => Object.fromEntries(scoreRows.filter((r) => r.scanId === id && r.rawScore !== null).map((r) => [r.concern, r.rawScore!]));
  const verdict = evaluateTrial({
    startAt,
    now: new Date(startAt.getTime() + TRIAL_DAYS * DAY),
    targetConcerns: ["redness", "pore"],
    baseline: scanIds.slice(0, 2).map(mapOf),
    checkins: scanIds.slice(2).map(mapOf),
    thresholds,
  });
  const [trial] = await d
    .insert(schema.trials)
    .values({
      userId: DEMO_USER_ID,
      productId: niaId,
      targetConcerns: ["redness", "pore"],
      baselineScanIds: scanIds.slice(0, 2),
      startAt,
      endAt: new Date(startAt.getTime() + TRIAL_DAYS * DAY),
      status: "completed",
      verdict,
      createdAt: startAt,
    })
    .returning();
  await d.insert(schema.verifiedReviews).values({
    userId: DEMO_USER_ID,
    productId: niaId,
    trialId: trial.id,
    rating: 5,
    body: "Redness around my nose is visibly calmer, and the scans back it up.",
    deltas: verdict.perConcern,
    consent: true,
  });

  // Diary: recent week, with a stressful stretch before yesterday's breakout.
  const diary = [
    { daysAgo: 6, sleepHours: 7.5, stress: 2, waterLiters: 2, notes: "Normal week." },
    { daysAgo: 4, sleepHours: 5, stress: 4, waterLiters: 1.2, diet: "Lots of takeaway, extra coffee", notes: "Deadline crunch." },
    { daysAgo: 3, sleepHours: 4.5, stress: 5, waterLiters: 1, newProducts: "Started the glycolic toner every night", notes: "Very little sleep." },
    { daysAgo: 1, sleepHours: 6, stress: 4, waterLiters: 1.5, diet: "Milk tea twice", notes: "Breakout on chin and jawline." },
  ];
  for (const e of diary) {
    const { daysAgo, ...rest } = e;
    await d.insert(schema.diaryEntries).values({ userId: DEMO_USER_ID, day: at(daysAgo).toISOString().slice(0, 10), ...rest });
  }

  // Anonymous community reviewers so the brand view clears its k≥3 floor.
  const community = [
    { product: PRODUCTS[0], deltas: { redness: [7.1, 5.4], pore: [4.8, 3.1] }, rating: 4, body: "Less oily by midday." },
    { product: PRODUCTS[0], deltas: { redness: [2.1, 4.9], pore: [1.2, 3.5] }, rating: 3, body: "Subtle — the scans said within noise." },
    { product: PRODUCTS[0], deltas: { redness: [8.3, 4.2], pore: [6.0, 3.8] }, rating: 5, body: "" },
    { product: PRODUCTS[1], deltas: { texture: [5.2, 4.0], wrinkle: [1.1, 3.3] }, rating: 4, body: "Smoother after week 3; some flaking early on." },
    { product: PRODUCTS[1], deltas: { texture: [-5.6, 4.1], wrinkle: [0.4, 3.0] }, rating: 2, body: "Too strong for me — stopped at day 18." },
    { product: PRODUCTS[1], deltas: { texture: [6.4, 3.6], wrinkle: [2.0, 3.9] }, rating: 5, body: "Texture finally improved." },
  ];
  for (const c of community) {
    const id = crypto.randomUUID();
    await d.insert(schema.users).values({ id, isDemo: true, displayName: "Community (demo)" });
    const ingredients = c.product.inci.split(/,\s*/);
    const [p] = await d
      .insert(schema.products)
      .values({ userId: id, name: c.product.name, brand: c.product.brand, category: c.product.category, ingredients, actives: detectActives(ingredients), source: "text", slot: c.product.slot })
      .returning();
    const s = at(40 + Math.floor(rand() * 20));
    const perConcern = Object.entries(c.deltas).map(([concern, [delta, threshold]]) => ({
      concern,
      baseline: 55,
      current: 55 + delta,
      delta,
      threshold,
      label: (delta > threshold ? "improved" : delta < -threshold ? "worse" : "within_noise") as "improved" | "worse" | "within_noise",
    }));
    const [t] = await d
      .insert(schema.trials)
      .values({
        userId: id,
        productId: p.id,
        targetConcerns: Object.keys(c.deltas),
        baselineScanIds: [],
        startAt: s,
        endAt: new Date(s.getTime() + TRIAL_DAYS * DAY),
        status: "completed",
        verdict: { status: "working", day: 28, perConcern, recommendation: "", evaluatedAt: new Date().toISOString() },
      })
      .returning();
    await d.insert(schema.verifiedReviews).values({ userId: id, productId: p.id, trialId: t.id, rating: c.rating, body: c.body, deltas: perConcern, consent: true });
  }

  console.log(`✓ demo seeded: ${scanIds.length} scans, ${PRODUCTS.length} products, 1 completed trial (${verdict.status}), ${diary.length} diary entries, ${community.length} community reviews`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
