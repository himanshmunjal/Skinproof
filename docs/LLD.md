# SkinProof — Low-Level Design (LLD)

> "You spent $60 on a serum. Is it working?" SkinProof measures it.

High-level picture: [`architecture.png`](./architecture.png) (source: `architecture.dot`).
Why each choice was made: [`../DECISION.md`](../DECISION.md). Build log: [`../FLOW.md`](../FLOW.md).

---

## 1. Scope (MVP for the hackathon)

| # | Capability | Brief moment it serves | YouCam API |
|---|---|---|---|
| 1 | Guided capture + quality gate | "standing in front of a mirror" | — (client) |
| 2 | Skin scan → scores, skin age, zone masks | all | **AI Skin Analysis (SD/HD)** |
| 3 | Calibration pair → per-user noise thresholds | "is it working?" | Skin Analysis ×2 |
| 4 | Noise-aware progress & deltas | "is it working?" | Skin Analysis history |
| 5 | Shelf: label photo/text → INCI → actives → conflicts | before purchase / mirror | — (LLM vision) |
| 6 | Pre-purchase check (URL or pasted INCI) | "right before a purchase" | uses latest scan |
| 7 | 28-day single-variable trial + verdict | "is it working?" | Skin Analysis check-ins |
| 8 | Breakout triage (diary + scan + agent) | "right after a bad breakout" | Skin Analysis |
| 9 | Coach agent (tool-calling loop, 9 tools) | all | via tools |
| 10 | Verified Results reviews + Brand insights | retail value | aggregated scan deltas |

Out of scope for MVP: auth providers, payments, native app, push notifications.

---

## 2. Folder structure

```
/                         Next.js app root
├── docs/                 architecture.(dot|png), LLD.md
├── DECISION.md  FLOW.md  README.md
├── drizzle/              generated SQL migrations (drizzle-kit)
├── scripts/              migrate.ts, seed-demo.ts
├── src/
│   ├── app/              App Router pages + /api route handlers
│   │   ├── api/…         thin HTTP layer: parse → call service → JSON
│   │   └── (pages)       scan, scans/[id] (Suspense + client view), progress, shelf, check, trials, breakout, coach, brand
│   ├── components/       UI (client components)
│   ├── lib/
│   │   ├── config.ts     env parsing (zod) — single source of config truth
│   │   ├── db/           schema.ts, client.ts (postgres-js | PGlite)
│   │   ├── youcam/       types.ts, client.ts (real), mock.ts, index.ts (factory), concerns.ts
│   │   ├── domain/       noise.ts, ingredients.ts, trial.ts — pure, unit-tested logic (no I/O)
│   │   ├── services/     scans, noise, products, trials, diary, images, usage, users, brand (DB + adapters)
│   │   ├── http/         handle.ts — shared Route Handler error mapping + connection()
│   │   ├── client/       browser-only helpers: api fetch, capture quality gate, labels
│   │   ├── agent/        tools.ts, run.ts, prompt.ts
│   │   ├── llm.ts        Groq/Gemini (OpenAI-compatible) client + extraction helpers
│   │   └── fetch-page.ts SSRF-guarded product-page fetch
│   └── data/             actives.ts (INCI → active → concerns), conflicts.ts (rules)
└── tests/                vitest unit tests for noise, ingredients, trials, youcam parsing
```

Layering rule: `app/api/*` → `lib/services/*` → `lib/domain/*` (pure) + `lib/{db,youcam,llm}`. Services never import from `app/`. UI never imports from `lib/services` (only via HTTP).

---

## 3. Data model (PostgreSQL via Drizzle)

```
users            id uuid PK, created_at, is_demo bool, display_name text?
images           id uuid PK, user_id FK, kind enum(scan|mask|product), mime, width, height, bytes bytea, created_at
scans            id uuid PK, user_id FK, image_id FK, mode enum(sd|hd), status enum(pending|running|success|error),
                 youcam_file_id?, youcam_task_id?, error_code?, overall_score real?, skin_age int?,
                 is_calibration bool, context enum(routine|calibration|checkin|breakout|purchase),
                 quality jsonb, raw_result jsonb?, units int?, created_at, completed_at?
scan_scores      scan_id FK, concern text, ui_score int?, raw_score real?, mask_image_id FK?   PK(scan_id, concern)
noise_profiles   user_id FK, concern text, threshold real, n_pairs int, updated_at              PK(user_id, concern)
products         id uuid PK, user_id FK, name, brand?, category?, ingredients jsonb(string[]), actives jsonb,
                 source enum(photo|text|url), source_url?, image_id FK?, slot enum(am|pm|both|none), on_shelf bool, created_at
trials           id uuid PK, user_id FK, product_id FK, target_concerns jsonb(string[]), baseline_scan_ids jsonb,
                 start_at, end_at, status enum(active|completed|stopped), verdict jsonb?, created_at
diary_entries    id uuid PK, user_id FK, day date, sleep_hours real?, stress int?, water_l real?, new_products text?,
                 diet text?, cycle_day int?, notes text?, created_at
chat_messages    id uuid PK, user_id FK, role enum(user|assistant), text, tool_trace jsonb?, created_at
verified_reviews id uuid PK, user_id FK, product_id FK, trial_id FK, rating int, body text,
                 deltas jsonb, consent bool, created_at
api_usage        id serial PK, user_id FK?, provider enum(youcam|claude|llm)  (claude = legacy rows), operation text, units int, meta jsonb, created_at
```

Indexes: `scans(user_id, created_at desc)`, `products(user_id)`, `trials(user_id, status)`, `diary_entries(user_id, day)`.

Images live in Postgres (`bytea`) so the whole app deploys as "one Next.js app + one database" — see DECISION D-07.

---

## 4. External contracts

### 4.1 YouCam (verified against docs.perfectcorp.com, Oct 2026)

| Step | Call | Notes |
|---|---|---|
| 1 | `POST {YOUCAM_BASE_URL}/s2s/v2.0/file` body `{files:[{content_type,file_name,file_size}]}` | → `data.files[0].file_id`, `requests[0].{method,url,headers}` |
| 2 | `PUT requests[0].url` with returned headers + raw bytes | Skipping this → 404/500 later |
| 3 | `POST /s2s/v2.0/task/skin-analysis` `{src_file_id, dst_actions[], miniserver_args:{enable_mask_overlay:false}, format:"json"}` | → `data.task_id` |
| 4 | `GET /s2s/v2.0/task/skin-analysis/{task_id}` | `data.task_status ∈ running|success|error`; `data.results.output[] = {type, ui_score, raw_score, mask_urls[]}` |

Auth: `Authorization: Bearer ${YOUCAM_API_KEY}`. Units are charged **only on success** (SD 16 concerns = 16u; HD 16 concerns = 22u). Results retained 24h → masks are copied into `images` on success.
Image rules: SD short side ≥ 480px, HD ≥ 1080px, long side ≤ 2560 (auto-resized), < 10MB, face width > 60% of image width.

Error mapping (→ friendly UI copy): `error_src_face_too_small`, `error_src_face_out_of_bound`, `error_lighting_dark`, `error_below_min_image_size`, `error_exceed_max_image_size`, `InvalidParameters`.

### 4.2 LLM: Groq or Gemini free tier (`openai` SDK, Chat Completions; D-29)

| Provider | Base URL | Default model | Default vision model |
|---|---|---|---|
| Groq | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` → `gpt-oss-20b` | `qwen/qwen3.8-27b` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.6-flash` → 3.5 → 2.5 Flash | `gemini-3.6-flash` (same chain) |

| Use | Call | Notes |
|---|---|---|
| Label photo → product JSON | `chat.completions.create` with `image_url` data URL + `response_format: json_schema` (strict) | falls back to `json_object` on 400; Zod re-validation |
| URL → product JSON | `fetchPageText(url)` (SSRF-guarded, D-30) → same JSON-schema call on the page text | JSON-LD first, 40k-char cap |
| Coach agent | hand-written loop: `tools` (Zod → JSON Schema) → run `tool_calls` → `role:"tool"` results, ≤ 8 iterations | `tool_calls` echoed verbatim (Gemini thought signatures) |

429s: SDK retries ×3 with `retry-after`; still 429 → `LlmRateLimited` → HTTP 503 "wait a minute".

---

## 5. HTTP API (all JSON, all scoped to the cookie user)

| Method & path | Request | Response |
|---|---|---|
| `GET /api/me` | — | `{user, calibrated, units:{used,budget}, counts}` |
| `POST /api/me/demo` | — | switch cookie to seeded demo user |
| `POST /api/scans` | multipart `image`, `context`, `quality` (json) | `{scan}` (status `running`) |
| `GET /api/scans` | `?limit` | `{scans:[…with scores]}` |
| `GET /api/scans/:id` | — | `{scan, scores, comparison}` — **lazily polls YouCam** if running |
| `GET /api/progress` | — | `{series: {concern: [{t, raw, ui}]}, thresholds}` |
| `GET /api/images/:id` | — | image bytes (owner-checked) |
| `GET/POST /api/products` | POST: multipart `image` **or** json `{text}` / `{url}` | `{product, conflicts}` |
| `PATCH/DELETE /api/products/:id` | `{slot, on_shelf}` | `{product}` |
| `GET /api/shelf/conflicts` | — | `{conflicts:[…]}` |
| `POST /api/check` | `{url?|text?}` | `{product, fit:{verdict, reasons, matches, conflicts, duplicates}}` |
| `GET/POST /api/trials` | POST `{product_id, target_concerns}` | `{trial}` |
| `GET /api/trials/:id` | — | `{trial, evaluation}` |
| `POST /api/trials/:id/review` | `{rating, body, consent}` | `{review}` |
| `GET/POST /api/diary` | entry fields | `{entries}` |
| `GET/POST /api/experiments` | POST `{kind, beforeScanId}` | `{calibrated, bands, experiments, summary}` / `{experiment}` |
| `PATCH/DELETE /api/experiments/:id` | `{afterScanId}` | `{experiment}` |
| `POST /api/agent` | `{message, lang?}` | `text/event-stream`: `step`, `text`, `done`, `error` events |
| `GET /api/agent` | — | chat history |
| `GET /api/brand` | — | `{products:[{name, n, mean_delta_by_concern, pct_improved}]}` |

---

## 6. Key sequences

### 6.1 Scan (lazy polling — no background workers)

```
Browser                    /api/scans               ScanService            YouCam              DB
  │ capture + quality gate      │                        │                    │                 │
  │──POST image────────────────▶│──create(user, img)────▶│ sharp normalize    │                 │
  │                             │                        │──insert image/scan(pending)─────────▶│
  │                             │                        │──POST /file───────▶│                 │
  │                             │                        │──PUT presigned────▶│                 │
  │                             │                        │──POST task────────▶│ task_id         │
  │                             │                        │──update scan(running, task_id)──────▶│
  │◀──{scan running}────────────│                        │                    │                 │
  │──GET /api/scans/:id (every 2.5s, backoff)──────────▶ │──GET task─────────▶│ running|success │
  │                             │                        │ on success: parse output, fetch masks│
  │                             │                        │   store scores+masks, usage += units │
  │                             │                        │   if calibration pair → NoiseModel   │
  │◀──{scan success, scores, comparison}─────────────────│                    │                 │
```

### 6.2 Calibration → noise thresholds
First-time users take **two scans ~1 minute apart** (re-framed). For every concern `c`:

```
d_c        = |raw_a − raw_b|                    (one pair)
σ̂_c        = d_c / √2                          (std of a single measurement)
threshold_c = max(FLOOR, z · √2 · σ̂_c) = max(FLOOR, z · d_c)    z = 1.96, FLOOR = 2.0 raw points
```
With more pairs (e.g. two check-in scans on the same day), σ̂ is pooled: `σ̂² = mean(d²)/2`.
A change between two scans is **real** only if `|Δraw_c| > threshold_c`; otherwise "within noise".
Users who skip calibration get a conservative default `threshold = 6`.

### 6.3 Trial verdict (28 days, one variable)
```
baseline = mean(raw) over baseline_scan_ids (calibration pair or last 2 scans)
current  = mean(raw) over the last ≤2 check-ins
Δ        = current − baseline         (higher raw = healthier, per YouCam docs)
day < 14                      → "too_early"
Δ >  threshold  (any target)  → "working"   (report per-concern)
Δ < −threshold  (any target)  → "worsening" → recommend stop
else                          → "no_change" (within noise) → recommend stop at day 28
```
On `completed` with consent, a **Verified Result** stores `deltas` and becomes visible in Brand insights.

### 6.4 Ingredient engine (deterministic, explainable)
1. The LLM extracts `{name, brand, category, ingredients[]}` (structured output) — the LLM *only reads*.
2. `normalizeINCI()` → lowercase, strip %/parentheses.
3. `ACTIVES` table maps INCI aliases → active (e.g. `retinol|retinal|retinyl palmitate|adapalene → retinoid`) → target concerns.
4. `CONFLICT_RULES` evaluated over every pair of on-shelf products sharing a slot (am/pm/both) + duplicate-active detection.
5. Pre-purchase "fit" = matches(product actives ↔ user's 3 weakest concerns) − conflicts − duplicates → `buy | buy_with_care | skip`.

### 6.5 Agent (tool-calling loop)
Tools (all user-scoped, read-mostly):
`get_skin_profile`, `get_scan_history`, `compare_scans`, `get_shelf`, `check_product`, `get_diary`, `log_diary_entry`, `list_trials`, `start_trial`.
- History sent as plain user/assistant text (no thinking/tool blocks stored) → append-only by construction.
- `/api/agent` streams SSE: one `step` event per tool call (shown as "Checking your shelf…"), then `text`, then `done`.
- Guardrails in system prompt: not a medical device; escalate to dermatologist for signs of infection, rapid mole change, severe cystic acne; never invent scores — only quote tool output.

### 6.6 Validation tests (D-39)
`experiments(id, user_id, kind ∈ {no_change, concealer, flush}, before_scan_id, after_scan_id?)`. Both scans use `context = 'validation'`, which `isMeasurement` excludes from progress, trials, baselines, comparisons and the coach.
- Result = `compareScoreMaps(before, after, user bands)`, then:
  - `no_change`: pass if outliers ≤ max(1, round(10% of readings)).
  - `concealer`: pass if dark_circle, redness or age_spot is `improved`.
  - `flush`: pass if redness is `worse`.
- Summary = pooled no-change in-band rate (expected ≈ 95%) and positive tests detected n/N.

### 6.7 Change strength (D-36)
`ratio = |Δ| / threshold`; `confidence` = `noise` (≤ 1), `likely` (< 2), `clear` (≥ 2). Attached to every `ConcernComparison` and trial `perConcern`.

---

## 7. Client capture quality gate
Computed on a downscaled canvas before upload (no ML dependency):
- **Resolution**: short side ≥ 1080 → HD eligible; ≥ 480 → SD; else block.
- **Brightness**: mean luma (Rec. 601) in [70, 210] else warn "too dark / blown out".
- **Blur**: variance of a 3×3 Laplacian on grayscale; < 60 → warn "hold still".
- **Lighting drift** (D-38): live centre-luma meter while the camera is open; warn when a photo's brightness differs > 20% from the median of the user's calibration photos (`GET /api/me → calibrationLight`).
- **Framing**: oval guide sized at ~70% of frame width (YouCam wants face > 60% width); server maps `error_src_face_too_small` to "move closer".

---

## 8. Config (`.env`)
`DATABASE_URL` (empty → PGlite at `./.data/pglite`), `YOUCAM_API_KEY`, `YOUCAM_BASE_URL`, `YOUCAM_MOCK`, `YOUCAM_MODE` (`auto|sd|hd`), `YOUCAM_UNIT_BUDGET`, `LLM_PROVIDER` (`auto|groq|gemini`), `GROQ_API_KEY`, `GEMINI_API_KEY`, `LLM_MODEL`, `LLM_VISION_MODEL`, `LLM_BASE_URL`, `DEV_TIME_TRAVEL`, `SCANS_PER_USER_PER_DAY`, `AI_CALLS_PER_USER_PER_DAY` (D-37), `APP_URL`. Validated once by zod in `lib/config.ts`; fail fast with readable errors.

## 9. Security & privacy
- Face photos are biometric-adjacent: stored only in our DB, served only to the owner (`/api/images/:id` checks `user_id`), "Delete my data" endpoint wipes the user cascade.
- YouCam + LLM keys server-only (never `NEXT_PUBLIC_`).
- URL fetching is done by our server (D-30): http(s) on 80/443 only, every resolved IP must be public (private, loopback, link-local/metadata, ULA blocked), redirects re-validated (≤ 3), 10 s timeout, 2 MB cap. Residual risk: DNS rebinding between lookup and connect.
- Upload limits: 10MB, `image/jpeg|png|webp|heic` → normalized to JPEG.
- Per-user daily caps on live scans and AI calls (429) protect the unit grant and free LLM quota on a public deployment (D-37).
- Brand insights only aggregate reviews with `consent = true`, minimum n=3 per product (k-anonymity floor).

## 10. Testing
Vitest unit tests for: noise thresholds & verdicts, INCI normalization & conflict rules, YouCam response parsing (real doc sample), trial evaluation. Mock YouCam mode makes the end-to-end flow runnable with zero units.
