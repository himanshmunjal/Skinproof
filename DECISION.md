# DECISION.md — SkinProof decision log

Every meaningful decision, why it was made, what was rejected, and any later reversal.
Format: **D-NN · Title** — Context → Decision → Why → Alternatives rejected → Status.
Status values: `Active`, `Superseded by D-xx`, `Revisited`.

---

## Product decisions

### D-01 · Product: "SkinProof — is your skincare actually working?"
- **Context:** Hackathon (YouCam API Skin AI & eCommerce VTO). Brief explicitly names three moments: *before a purchase*, *after a breakout*, *in front of a mirror deciding whether a product is working*. Judges warn against "surface-level wrappers". Builder has no AR/VR hardware.
- **Decision:** Build a measurement-first skincare co-pilot on the **Skin AI track**: noise-calibrated scans, ingredient-aware shelf, 28-day single-variable trials, pre-purchase fit check, breakout triage, an agent that ties it together, and "Verified Results" reviews for brands.
- **Why:** One product that answers all three brief moments; the core insight (people never *measure* whether a product works) is a real, unsolved consumer pain; "Verified Results" gives a B2B story aligned with YouCam's actual customers (beauty brands). Everything is photo → REST, so no AR hardware is needed.
- **Rejected:** Generic VTO shop (crowded, wrapper-ish); "score + product carousel" (what most entries will build); doing both tracks (dilutes depth).
- **Status:** Active.

### D-02 · Track = Skin AI only; VTO kept as optional stretch
- **Why:** Depth beats breadth in judging; unit budget (1,000) is better spent on repeat scans, which are the core of the product.
- **Status:** Active.

### D-03 · Noise-aware measurement (calibration pair) is the headline differentiator
- **Context:** Any AI score wobbles between two photos of the same face (light, angle, distance). Showing "+3 redness!" when it is noise destroys trust.
- **Decision:** First-time users take two scans ~1 min apart. Per concern, threshold = `max(2.0, 1.96 · |raw_a − raw_b|)` (≈95% band for the difference of two measurements, derived in LLD §6.2). Changes inside the band are reported as "within noise". Users without calibration get a conservative default of 6.
- **Why:** Statistically honest, cheap (one extra scan), explainable to a judge in one sentence, and almost nobody else will do it.
- **Rejected:** Fixed global threshold (ignores per-device/per-person variance); ignoring noise (misleading).
- **Status:** Active.

### D-04 · LLM reads, rules decide (ingredient conflicts are deterministic)
- **Decision:** Claude only *extracts* product name/INCI from photos/URLs/text (structured output). Mapping INCI → actives → concerns and all conflict checks run from hand-written tables in `src/data/`.
- **Why:** Explainable, testable, no hallucinated "retinol + niacinamide is dangerous" style claims; judges can read the rules.
- **Rejected:** Asking the LLM "is this combination safe?" (non-deterministic, untestable).
- **Status:** Active.

### D-05 · Trials are single-variable and 28 days
- **Why:** ~28 days ≈ one epidermal turnover cycle; one change at a time is the only way to attribute an effect. Verdict "too early" before day 14.
- **Status:** Active.

---

## Tech-stack decisions

### D-06 · Next.js (App Router) full-stack, TypeScript
- **Context:** User first asked about React + Go + Postgres vs Next.js, then chose **Next.js only**.
- **Decision:** Next.js 16.4 (scaffolded by `create-next-app@16.4.3`), React 19.3, Tailwind v4, Route Handlers as the backend.
- **Why:** One repo, one deploy, one language end-to-end → fastest iteration for a hackathon; judges can `npm run dev` and see everything.
- **Trade-off acknowledged:** Serverless time limits make long polling awkward → solved by D-09 (lazy polling).
- **Status:** Active.

### D-07 · PostgreSQL via Drizzle ORM, with embedded PGlite fallback; images stored in Postgres
- **Decision:** `DATABASE_URL` set → `postgres` (postgres-js) driver. Unset → **PGlite** (real Postgres compiled to WASM) persisted at `./.data/pglite`. Same Drizzle schema & SQL migrations for both. Images (scan photos, masks, product labels) stored as `bytea`.
- **Why:** Local Postgres on this machine needs a password we don't have; more importantly, judges can clone and run with **zero database setup**. Storing images in Postgres keeps deployment to "Next.js + one DB" (Neon/Supabase), no S3 bucket to configure. Drizzle: thin, SQL-like, typed, no codegen step at runtime (Prisma rejected for its generate step and heavier engine).
- **Trade-off:** `bytea` images aren't CDN-friendly; acceptable at hackathon scale (photos are normalized to ≤2560px JPEG). Swap to object storage later via `ImageService`.
- **Status:** Active.

### D-08 · YouCam client behind an interface with a **mock** implementation
- **Decision:** `YouCamClient` interface; `RealYouCamClient` (fetch, verified endpoints) and `MockYouCamClient` (deterministic scores seeded by image hash + small noise, fake masks). `YOUCAM_MOCK=true` or a missing key selects the mock.
- **Why:** 1,000 free units ≈ 45 HD scans (22u each). Development, UI work and tests must not burn units. Same interface ⇒ flipping one env var switches to real.
- **Status:** Active.

### D-09 · Lazy polling instead of background workers
- **Decision:** `POST /api/scans` creates the YouCam task and returns immediately. The client polls `GET /api/scans/:id`; *that* request performs one YouCam status check if the scan is still running and persists the result on success.
- **Why:** Works on serverless (Vercel) with no queue/cron, no long-lived connections, and naturally rate-limited by the client's backoff. YouCam docs advise against rapid polling; results live 24h so there's no rush.
- **Rejected:** Webhooks (need a public URL during local dev), server-side loop (serverless timeout risk).
- **Status:** Active.

### D-10 · Copy YouCam masks into our DB on success
- **Why:** `mask_urls` expire (results retained 24h). Progress views need masks weeks later.
- **Status:** Active.

### D-11 · Claude via official `@anthropic-ai/sdk` (v1.3.0); model `claude-opus-5-5` (env-overridable)
- **Decision:** Agent uses `client.beta.messages.toolRunner` with `betaZodTool` tools (Zod schemas, validated inputs), `output_config.effort: "medium"`; extraction uses `messages.parse` + `zodOutputFormat` at effort `low`. Server-side refusal fallback `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) enabled on agent calls. Model is `ANTHROPIC_MODEL` (default `claude-opus-5-5`).
- **Why:** Tool runner = no hand-written loop; Zod gives typed, validated tool inputs; structured outputs guarantee parseable product JSON. Fallbacks keep the coach answering if a request is declined by a safety classifier.
- **Status:** Superseded by D-29 (2026-10-30).

### D-12 · Chat history stored as plain text turns (no thinking/tool blocks)
- **Why:** Current models bind thinking blocks to the conversation; replaying edited history is rejected. Sending only prior user/assistant **text** is append-only by construction, cheaper, and tools re-read fresh data anyway. Tool calls are kept in `chat_messages.tool_trace` purely for UI display.
- **Status:** Active.

### D-13 · URL product lookup via Anthropic's `web_fetch` server tool
- **Why:** Our server never fetches arbitrary user-supplied URLs → no SSRF surface to defend. Fallback path: user pastes the INCI list.
- **Status:** Superseded by D-30 (2026-10-30).

### D-14 · Anonymous cookie identity (no auth provider)
- **Decision:** `sp_uid` httpOnly cookie → `users` row created lazily by API routes. "Use demo account" switches the cookie to the seeded demo user.
- **Why:** Zero-friction for judges ("first-time user instantly grasps value"); auth is not what's being judged. Data is still strictly per-user.
- **Status:** Active.

### D-15 · All data access through `/api/*`; pages are client components
- **Why:** Cookie creation must happen in Route Handlers (Server Components can't set cookies). Keeps one clear boundary (UI ↔ HTTP ↔ services) and makes the same API usable by a future mobile app.
- **Status:** Active.

### D-16 · Keep Next 16 defaults: `cacheComponents` + `partialPrefetching`; no `runtime`/`dynamic` exports
- **Why:** Read `node_modules/next/dist/docs` (AGENTS.md instructs to): with Cache Components, `runtime` and `dynamic` segment configs are removed/unsupported; route handlers reading cookies are dynamic automatically. `@electric-sql/pglite` added to `serverExternalPackages` (sharp is external by default).
- **Status:** Active.

### D-17 · Capture quality gate in the browser, no ML model shipped
- **Decision:** Brightness (mean luma), resolution (SD/HD eligibility), blur (Laplacian variance) on a canvas; face-oval guide at ~70% width; YouCam face-size errors mapped to friendly copy.
- **Why:** Every failed scan wastes a round-trip (failed tasks are free, but time isn't); bad photos are the #1 source of noise. No face-detection model download keeps first load fast.
- **Status:** Active.

### D-18 · Vitest for unit tests of pure domain logic
- **Why:** Noise math, conflict rules, trial verdicts and YouCam parsing are where bugs would silently mislead users; they're pure functions → cheap to test.
- **Status:** Active.

### D-19 · Dependency notes
- `@types/node` bumped from scaffold's `^20` → `^22` to match the local Node 22 runtime and satisfy vitest 5's peer range (instead of `--legacy-peer-deps`).
- `npm audit`: 4 moderate advisories, all inside **drizzle-kit** (dev-only CLI, via `@esbuild-kit`). Not shipped to production; accepted.
- **Status:** Active.

### D-20 · Tool runner with `thread: false`
- **Context:** SDK 1.3's tool runner defaults to running over a "message thread" (sends only new messages per turn).
- **Decision:** Pass `thread: false` → the runner resends full history on each request over the standard Messages API.
- **Why:** Turns are short (≤10 iterations), and this avoids depending on an additional beta surface during a hackathon.
- **Status:** Superseded by D-31 (2026-10-30).

### D-21 · Lock each user to the scan mode (SD/HD) of their first successful scan
- **Why:** SD and HD are different models with different score distributions; mixing them would create fake "changes". If a later photo is too small for the locked mode, the upload is rejected with a clear message instead of silently switching.
- **Status:** Active.

### D-22 · Pasted ingredient lists never go to the LLM
- **Why:** A comma-separated INCI list is already structured; deterministic splitting is instant, free, works without an Anthropic key, and can't hallucinate. Only photos and URLs need Claude.
- **Status:** Active.

### D-23 · Concurrency-safe result persistence
- **Context:** Two browser tabs (or a fast double-poll) can both see `running → success` at once.
- **Decision:** Masks are downloaded outside the DB transaction; inside it, `UPDATE … WHERE status='running' RETURNING` claims the scan, and only the winner inserts scores/masks and records unit usage.
- **Why:** No duplicate rows, no double-counted units, no long transactions holding network I/O.
- **Status:** Active.

### D-24 · All `/api/*` handlers call `connection()` first
- **Context:** With Cache Components, `next build` tries to prerender GET handlers that don't read the request. The first build attempted `/api/progress` and `/api/brand`; our error wrapper caught Next's internal "prerender aborted" rejection and logged it as a crash, and `/api/brand` (no cookies) could have opened the DB at build time.
- **Decision:** `handle()` awaits `connection()` (from `next/server`, per the bundled docs) *before* its try/catch.
- **Why:** Makes every API route explicitly request-time; build never touches the database; no swallowed framework signals.
- **Status:** Active.

### D-25 · URL-dependent client hooks live inside `<Suspense>`
- **Context:** Build failed: `usePathname()` (nav) and `useParams()` (`/scans/[id]`) read runtime URL data outside Suspense, which blocks prerendering under Cache Components.
- **Decision:** Use the docs' "stream" option, not the "block" opt-out: the nav is wrapped in `<Suspense fallback={<NavFallback/>}>`; `/scans/[id]/page.tsx` is a tiny server component that renders the client view inside Suspense. Query strings are read in effects (`window.location`) instead of `useSearchParams` for the same reason.
- **Result:** Static shells for all pages; `/scans/[id]` is a Partial Prerender.
- **Status:** Active.

### D-26 · Effects must never return a value (browser `scrollIntoView` returns a Promise)
- **Context:** Headless-Chrome screenshot run caught `TypeError: i is not a function` on `/coach`. Cause: `useEffect(() => ref.current?.scrollIntoView(...))` returned the call's result; current Chrome returns a Promise from scroll methods and React invoked it as the cleanup.
- **Decision:** Block-bodied effects; comment left in code. Audited all other effects.
- **Status:** Active.

### D-27 · A single calibration pair is a high-variance noise estimate — pool, and keep the demo deterministic
- **Context:** Seeding the demo with random calibration noise produced bands from ±2 to ±16 for the *same* underlying wobble. That is simply the statistics of estimating spread from one difference (a χ² with 1 degree of freedom).
- **Decision (product):** Keep the formula, but pool every calibration pair (`recomputeNoiseProfile`) and invite users to "repeat any time" on the scan page; the floor (2.0) prevents absurdly tight bands. Future work: shrink single-pair estimates toward a population prior.
- **Decision (demo):** The seed uses fixed, realistic calibration differences and small fixed check-in jitter, so the 3-minute video tells exactly one story (only the trial's target concerns leave their bands). Demo data is labelled as such in the UI.
- **Status:** Active.

### D-28 · MIT license; fictional brands in demo data
- **Why:** Submission rules require a public repo "with relevant licensing" and forbid third-party trademarks in the video. Copyright line reads "The SkinProof authors". Edit it to your name if you want.
- **Status:** Active.

---

## Version 2 — switch to free LLM tiers (2026-10-30)

### D-29 · LLM provider: Groq or Gemini free tier through one OpenAI-compatible client
- **Context:** The builder will use the free Groq API or the Gemini free tier, not a paid Claude key. D-11 tied the app to `@anthropic-ai/sdk`.
- **Decision:** Remove `@anthropic-ai/sdk` and add the official `openai` SDK (v7.45.1), used only as a Chat Completions client. `src/lib/claude.ts` becomes `src/lib/llm.ts`. Both providers expose an OpenAI-compatible endpoint:
  - **Groq:** `https://api.groq.com/openai/v1`. Agent and URL extraction use `openai/gpt-oss-120b`; label photos use `qwen/qwen3.8-27b`. These are Groq's documented models with tool use, strict JSON schema, and image input.
  - **Gemini:** `https://generativelanguage.googleapis.com/v1beta/openai/`, initially `gemini-3.8-flash` for everything (the model in Google's compatibility docs). Changed to `gemini-3.6-flash` by D-32.
  - **Selection:** `LLM_PROVIDER=auto` uses Groq when `GROQ_API_KEY` is set, otherwise Gemini. `LLM_MODEL`, `LLM_VISION_MODEL` and `LLM_BASE_URL` override the defaults.
- **Why one client instead of `groq-sdk` + `@google/genai`:** one code path, one set of tests, and switching provider is a single env change. Chat Completions is the shared contract for function calling, `image_url` data URLs and `response_format: json_schema`.
- **Structured extraction:** the JSON schema is hand-written for Groq's strict mode, where every field is required and extra keys are not allowed. "Unknown" is an empty string rather than a nullable union, so Gemini's schema subset accepts it too. If a model rejects `json_schema` with a 400, the request is retried with `json_object` mode, and the prompt repeats the shape for that case. Output is always re-validated with Zod and normalised by `toProductExtract` (empty → null, unknown category → null).
- **Free-tier limits:** the SDK has `maxRetries: 3` and honours `retry-after` on 429s. A 429 that persists becomes `LlmRateLimited`, which the API returns as a 503 and the coach shows as "wait a minute". Tool results are now compact JSON, and history is cut from 20 turns to 10, to stay under tokens-per-minute caps.
- **DB:** new migration `0001_llm_provider.sql` adds `'llm'` to `usage_provider`. `'claude'` stays because Postgres can't drop enum values and old rows may use it. The provider and model are recorded in `meta`.
- **Lost vs. Claude:** server-side refusal fallback, `effort` control, hosted `web_fetch`. Accepted for a zero-cost stack.
- **Alternatives rejected:** keeping the Anthropic SDK (no free tier for the builder); OpenRouter (an extra hop; the user named Groq or Gemini specifically); provider-native SDKs (two code paths).
- **Status:** Active.

### D-30 · Product links are fetched by our server, with SSRF guards
- **Context:** D-13 relied on Anthropic's hosted `web_fetch`, so our server never requested user-supplied URLs. Groq and Gemini compatibility endpoints have no equivalent tool.
- **Decision:** `src/lib/fetch-page.ts` handles the fetch:
  - **Allowed targets:** http(s) only, on ports 80 and 443. Every resolved address must be public; loopback, RFC 1918, CGNAT, link-local and cloud metadata `169.254.169.254`, multicast, ULA and IPv4-mapped IPv6 are rejected via `node:net` `BlockList`.
  - **Redirects:** followed manually, at most 3 hops, each one re-validated.
  - **Request limits:** 10 s timeout, 2 MB body cap, HTML or plain text only.
  - **Text extraction:** JSON-LD product data comes first, because it often carries the INCI list. Then visible text with scripts and styles stripped, capped at 40k characters. Only that text goes to the LLM.
- **Bug caught in testing:** Node's `BlockList` matches *IPv4* addresses against an `::ffff:0:0/96` rule, so that rule blocked every public site. It was removed; mapped addresses are unwrapped and checked as IPv4 instead. Tests now check allowed addresses as well as rejected ones.
- **Known residual risk:** DNS rebinding between our lookup and `fetch`'s own lookup. Pinning the resolved IP needs a custom dispatcher; not worth it for a hackathon. Documented here.
- **Status:** Active.

### D-31 · Hand-written tool loop replaces the Anthropic tool runner
- **Decision:** `runAgent` is a plain loop: Chat Completions with `tools` → run each `tool_call` → append `role:"tool"` results → repeat, at most 8 iterations. Tools are defined with a small `tool()` helper. Zod produces the JSON Schema via `z.toJSONSchema`, with `$schema` and `additionalProperties` stripped for Gemini, and validates the model's arguments before `run`. Bad JSON or invalid arguments go back to the model as a tool error instead of failing the turn.
- **Gemini detail:** assistant `tool_calls` are echoed back verbatim, so Gemini's thought signatures round-trip (Gemini 3 requires them).
- **Status:** Active.

### D-32 · Default `gemini-3.6-flash` plus a model fallback chain
- **Context:** First live run with the builder's Gemini key. The coach timed out after 2.3 min. A direct probe showed the key and network were fine, but `gemini-3.8-flash`, `gemini-3.7-flash` and `gemini-flash-latest` returned **503 "currently experiencing high demand"** on the free tier. `gemini-3.6-flash`, `3.5-flash` and `2.5-flash` answered tool calls in 2–3 s. During the next few calls, 3.6 and 3.5 also returned **429** (free-tier per-minute caps).
- **Decision:**
  - The Gemini default is now `gemini-3.6-flash`.
  - Every call goes through `complete(kind, params)`, which tries `[LLM_MODEL or default, ...fallbacks]` in order. Gemini falls back to `gemini-3.5-flash` then `gemini-2.5-flash`; Groq falls back to `openai/gpt-oss-20b`.
  - A model is skipped on 429, 404, any 5xx, or a connection error/timeout. A 400 is thrown at once, because it's our bug or a JSON-mode mismatch that the caller handles.
  - SDK retries drop from 3 to 1 and the timeout from 120 s to 45 s, so a busy model is skipped quickly instead of waited on.
  - If the whole chain fails, the user gets `LlmRateLimited`: "busy or rate-limited, wait a minute".
- **Why:** On free tiers, which model is up or under quota changes minute to minute. Each model has its own quota, so falling through to another one keeps the demo working.
- **Verified live (Gemini):**
  - Coach: 4 tool calls, noise-aware answer, 17 s.
  - Label photo: 8/8 ingredients read exactly, 9 s.
  - Product URL: full INCI list from a live page, 10 s. The fallback chain absorbed the 429s.
- **Status:** Active.

### D-33 · One score row per concern, even when YouCam repeats a type
- **Context:** First live scan on the user's machine. Saving the result failed with `duplicate key ... (scan_id, concern)=(…, skin_type)`. The live API returned more than one `skin_type` item for one task, with null `ui_score`/`raw_score` and a mask URL. The docs give skin type sub-results `whole`, `t_zone` and `u_zone` but show no example output. The parser assumed one item per type, which held for the documented examples and the mock.
- **Decision:** `parseSkinOutput` merges items that map to the same concern. A row keeps the first item's scores; if that item has no scores, it takes the first later item that does. The first mask URL is kept. The whole transaction rolled back, so the scan stayed `running`; YouCam keeps results 24 h, and the next poll re-reads and stores them. No units are lost.
- **Diagnostics:** completed scans log `[scan] repeated output types merged: type{fields}`, so the real zone structure can be read from the first live run. Per-zone skin type is a possible later feature.
- **Status:** Active.

### D-34 · Developer time travel shifts a user's records into the past (no fake clock)
- **Context:** A 28-day trial can't be exercised during a hackathon, and the builder can't buy products to wait out. They asked for a backdate option.
- **Decision:** `POST /api/dev/time-travel {days}` (1–28) runs one transaction that subtracts N days from every dated record *of the current user*: scans, images, products, trials (start/end/created), diary days, chat, reviews, noise profiles, and the user row. `users.time_shift_days` (migration `0002`) counts the total. Every verdict compares against the real `now`, so the next real scan lands N days after the previous one, and trials, the calibration window, charts and the coach all behave as if time had passed.
- **Why not a fake clock (`NOW_OFFSET`):** "now" is read in many places (SQL `defaultNow()`, `Date.now()` in services, the browser). An offset would have to be threaded through all of them, and one miss would silently mix two timelines. Shifting the data keeps one clock and needs no changes to domain code.
- **Why not editing single scan dates:** it can break invariants (scans before their calibration, trials starting after check-ins). A uniform shift keeps every relative interval intact.
- **Guards:**
  - Off unless `DEV_TIME_TRAVEL=true`.
  - Refused for the shared demo account.
  - 1–28 days per step.
  - The UI shows a dashed "Developer time travel" panel on Trials and a **"Time-shifted +Nd"** badge in the nav, so shifted data can't pass for real elapsed time.
- **Verified (mock, throwaway DB via `PGLITE_DIR`):**
  - The trial went day 0 `insufficient_data` → +7 `too_early` → +14 `no_change` → +28 `no_change`, correct for identical test photos.
  - Diary day 10-30 → 10-27 after +3.
  - The demo account and 99 days were refused.
- **Status:** Active.

### D-35 · Malformed ids answer 404, not 500
- **Context:** The time-travel test passed an empty product id. Postgres raised `22P02 invalid input syntax for type uuid` and the API returned 500 "Something went wrong". Ten service functions take ids from the URL or body.
- **Decision:** `handle()` maps SQLSTATE `22P02` (read from Drizzle's wrapped `cause`) to the same 404 as an unknown id, in one place, rather than validating in each service.
- **Also:** `PGLITE_DIR` env override so tests and a second server can use a throwaway embedded database without touching the real one.
- **Status:** Active.

---

## Round 3: closing the gaps for a top-3 finish (2026-10-30)

The user asked to "fix all the gaps" before a 1,000+ team global hackathon and will deploy the app themselves. With that many entries, the bar is proof that the method works, a live link judges can open, and an honest story. So this round adds depth to the core claim rather than more features.

### D-36 · Every change is also expressed in noise bands ("2.1× your normal wobble")
- **Context:** "▲ 4.0, band ±3.1" is correct but asks the reader to do arithmetic. Judges and users need the meaning.
- **Decision:** `signalRatio = |Δ| / threshold` and `confidenceOf`:
  - ≤ 1× → `noise`
  - 1–2× → `likely` real
  - ≥ 2× → `clear`
- The band is a 95% interval, so 1× is the line between "could be noise" and "real". These are attached to every comparison and trial concern.
- **UI:** shown on the scan result (new "What really changed" card), progress list, trials and the dermatologist report. One client helper (`strength()` in `lib/client/labels.ts`) builds the text from the pure domain functions, so the wording and thresholds can't drift.
- **Back-compat:** verdicts stored before this lack `ratio`, so the UI derives it from `delta`/`threshold`.
- **Status:** Active.

### D-37 · Public-deployment guards: daily per-user caps, serverless-safe config
- **Context:** Accounts are anonymous cookies. On a public URL, one curious visitor could spend the 1,000-unit YouCam grant or the free Gemini quota.
- **Decision:**
  - `SCANS_PER_USER_PER_DAY` (default 10, live scans only; mock scans are free and uncounted).
  - `AI_CALLS_PER_USER_PER_DAY` (default 60: coach turns, label photos, product links).
  - Both are counted from `api_usage` over a rolling 24 h. `QuotaExceeded` maps to HTTP 429 with a friendly message.
  - The global unit budget check still applies on top.
- **Also:**
  - `maxDuration = 60` on the scan, product, check and experiment routes (the coach already had 300), so serverless platforms don't cut off photo processing or LLM calls.
  - The DB client refuses to start PGlite on Vercel and explains that `DATABASE_URL` is required. A read-only, per-instance file system would otherwise fail cryptically.
- **Why not IP limits:** per-IP state needs a shared store, and campus or conference Wi-Fi puts many judges behind one IP. Per-user caps plus the global budget bound the worst case.
- **Status:** Active.

### D-38 · Lighting consistency check against the user's calibration photos
- **Context:** Light is the largest source of score noise. The noise band is only valid if later scans are taken in conditions like the calibration.
- **Decision:**
  - `GET /api/me` returns `calibrationLight`, the median brightness of the user's calibration photos (already captured by the client quality gate).
  - The camera shows a live light meter (centre luma sampled twice a second): too dark, too bright, or "matches your calibration".
  - A photo whose brightness differs by more than 20% gets a non-blocking warning.
  - The calibration pair itself isn't compared, because it *is* the reference.
- **Why non-blocking:** a slightly different light is still a usable scan. The warning teaches the habit without stopping anyone.
- **Status:** Active.

### D-39 · User-run validation tests with known answers ("Method & evidence" page)
- **Context:** The noise band is the core claim. Asserting it is weak; letting anyone check it is strong, and few other entries will have this.
- **Decision:** three before/after tests, stored in a new `experiments` table:
  - **Nothing changed:** about 95% of readings should stay in band. It passes with at most max(1, 10%) outliers, because a 95% band produces a chance outlier about 1 time in 20.
  - **Concealer:** dark circles, redness or spots must come out *improved*.
  - **Flush** (warm wash or exercise): redness must come out *worse*.
- The page shows the method in three steps, the user's per-concern bands with pair counts, a running summary (no-change readings within band %, real changes detected n/N), a test log, and a "limits we're honest about" section, including skin-tone fairness.
- **Test scans are quarantined:**
  - They use a new `validation` scan context and are excluded from progress, trials, baselines, the scan comparison chain and the coach (`isMeasurement` filter in one place). A concealer photo can never become "progress".
  - They are also not fed into calibration, so the no-change test stays an out-of-sample check of the band.
- **Not seeded for the demo account:** evidence must come from real scans. Mock-scan tests are flagged "simulated".
- **Status:** Active.

### D-40 · Coach replies in the user's language
- **Context:** A global hackathon, and Perfect Corp's markets are heavily Asian. Translating the whole UI is large; the coach is where the words matter most.
- **Decision:**
  - A "Reply in" picker on the Coach page, with 10 languages, remembered in `localStorage`.
  - The server allow-lists the code and adds a *second* system message ("Reply in Hindi… keep product and INCI names as printed"), so `SYSTEM_PROMPT` stays byte-stable for prefix caching.
  - The Breakout page's handoff to the coach uses the same saved language.
- **Verified:** a live Gemini answer in Hindi with the product terms preserved.
- **Status:** Active.

### D-41 · Dermatologist report, privacy & safety page, installable app, business model
- **Dermatologist report** (`/report`): one printable page (browser print → PDF, no PDF library) covering the score range, every concern with its change and band, the routine with flagged combinations, and trial outcomes. It turns personal data into something useful in a doctor's office.
- **Privacy & safety** (`/privacy`): what is stored and who sees it, the user's controls, and a "see a doctor for…" list. Linked from a new site footer, which also carries the not-medical-advice line.
- **Installable:** `app/manifest.ts` plus generated icons (192, 512 maskable, Apple 180). Skincare happens at a mirror, on a phone.
- **Business model on the brand page:**
  - Brands get the efficacy dashboard (subscription).
  - Retailers get the "will this work for me?" widget and Verified badge (per check).
  - Users use it free.
  - A per-product badge preview shows the strongest measured result with its n.
- **Status:** Active.

---

## Version 3 — polish for the final round (2026-11-02)

### D-42 · Routine planner: deterministic, graph-coloured nights
- **Context:** The shelf listed clashes but left the user to work out a routine.
- **Decision:** `domain/routine.ts` builds the routine from the shelf. Placement rules: SPF is dropped from the evening and retinoids leave the morning. Morning clashes move the night-friendly product to PM, and vitamin C or SPF never moves. Clashing PM products are greedy-coloured into nights using `findConflicts` (the same rules the shelf shows), with a recovery night on Sunday. Steps are ordered by category (cleanse → … → SPF). Category is inferred from the name when the extractor gave none.
- **Why:** Turns a warning into an action ("Apply to my shelf"), stays explainable, and can't disagree with the clash list. 7 unit tests.
- **Status:** Active.

### D-43 · Proof card rendered on the server with `next/og`, owner-only
- **Decision:** `GET /api/trials/[id]/card` returns a 1200×630 PNG. It is user-scoped like every route, so another user gets 404. It contains no photo or personal data. Fonts are the app's own (Geist, Fraunces; OFL) shipped as TTF in `src/assets/fonts`, because satori can't read woff2. They are traced into the function with `outputFileTracingIncludes`. Product names use Geist because Fraunces' "+" glyph renders incorrectly in satori.
- **Why:** A measured result people can post is the growth loop for Verified Results. Server rendering gives one identical image everywhere, and the Web Share API (with clipboard fallback) hands it to the phone.
- **Rejected:** Public share URLs, which would expose trial data without an auth model.
- **Status:** Active.

### D-44 · Skin weather in the browser (Open-Meteo)
- **Decision:** UV max and humidity come from Open-Meteo (free, keyless), fetched client-side. The location is rounded to 0.01° and kept in localStorage. Advice is a pure function (`domain/weather.ts`, 5 tests) of the weather, the shelf's actives and the weakest measured concerns. It also warns against scanning in direct sun, so scans keep matching the calibration light.
- **Why:** Contextual and useful daily, with zero server-side location data.
- **Status:** Active.

### D-45 · Settle in-flight scans before comparing (bug fix)
- **Context:** End-to-end testing with a fresh user found that after the 2-photo calibration the user was **not calibrated**. Lazy polling (D-09) only advances the scan being viewed, and the client polls only the second photo. The first stayed `running`, so `recomputeNoiseProfile` never saw a pair, the "your noise bands" card was empty and the coach used the default ±6. The seeded demo hid it because it writes scores directly.
- **Decision:** `settleRunningScans(userId)` refreshes the user's other running scans, oldest first, before `scanDetail`, `progress`, `startTrial` and every coach turn. When nothing is running it costs one indexed query.
- **Status:** Active. Covered by the E2E run (asserts `/api/me` → `calibrated: true` right after the pair).

### D-46 · Design system v2
- **Decision:** Tokens gained a second accent (rose), soft shadows and glow backgrounds. The theme is now explicit (`data-theme`, light / dark / system toggle, set before paint by an inline script). Inline SVG icons replace unicode glyphs, with no icon dependency. Loading states are skeletons, and motion respects `prefers-reduced-motion`. Desktop nav shows 6 primary links plus a "More" menu. Mobile adds a "More" sheet: previously Check, Breakout, Evidence and Brands were unreachable on phones. A ⌘K palette covers pages and common actions.
- **Status:** Active.

