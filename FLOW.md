# FLOW.md — SkinProof build flow

Chronological log of how the project was built: every step, in order, with what changed and why.
Decisions referenced as D-NN live in [DECISION.md](./DECISION.md).

---

## Phase 0 — Research & design (2026-10-30)

| # | Step | Output |
|---|---|---|
| 0.1 | Checked toolchain: Node 22.16, npm 10.9, Graphviz `dot`, Python 3.11, Postgres 17 running on :5432 (password-protected), Docker daemon not running | — |
| 0.2 | Read YouCam docs (AI Skin Analysis reference + Quick Start). Confirmed: host `yce-api-01.makeupar.com`, Bearer auth, File API → PUT presigned → task → poll; output `{type, ui_score, raw_score, mask_urls}`; units charged only on success; SD/HD concern lists; image rules; error codes | LLD §4.1 |
| 0.3 | Read Claude SDK (TypeScript) guidance: tool runner, `betaZodTool`, `messages.parse` + `zodOutputFormat`, `fallbacks: "default"` | D-11 |
| 0.4 | Wrote architecture diagram in Graphviz and rendered it | `docs/architecture.dot`, `docs/architecture.png` |
| 0.5 | Wrote low-level design: folders, schema, API contracts, sequences, noise math, verdict rules, security | `docs/LLD.md` |

## Phase 1 — Scaffold

| # | Step | Output |
|---|---|---|
| 1.1 | `create-next-app@16.4.3` (TS, Tailwind v4, ESLint, App Router, `src/`) generated in scratch dir (target dir already had docs) and rsynced in; `git init` (no commits made) | Next 16.4.3, React 19.3 |
| 1.2 | Read bundled Next 16 docs (route handlers, cacheComponents, segment config) per AGENTS.md | D-16 |
| 1.3 | Installed runtime deps: `@anthropic-ai/sdk@1.3.0 zod@4.6.7 drizzle-orm@0.45.4 postgres@4.0.0 @electric-sql/pglite@0.5.13 sharp@0.35.5 recharts@3.10.1` | package.json |
| 1.4 | Dev deps install failed (ERESOLVE: vitest 5 wants `@types/node` ≥22). Fixed by aligning `@types/node@^22` with the Node 22 runtime → `drizzle-kit@0.31.11 tsx vitest@5.0.5 dotenv` | D-19 |
| 1.5 | Started DECISION.md and FLOW.md | this file |

## Phase 2 — Backend

| # | Step | Output |
|---|---|---|
| 2.1 | Config files: `.gitignore` (adds `.data/`, keeps `.env.example` tracked), `.env` + `.env.example`, `next.config.ts` (`serverExternalPackages: [pglite]`), `drizzle.config.ts`, npm scripts (`typecheck`, `test`, `db:*`, `setup`) | D-16 |
| 2.2 | `lib/config.ts` — zod-validated env; mock auto-enabled when no YouCam key | D-08 |
| 2.3 | `lib/db/schema.ts` (11 tables, bytea images) → `drizzle-kit generate` → `drizzle/0000_init.sql` | D-07 |
| 2.4 | `lib/db/client.ts` — postgres-js **or** PGlite; **revision:** made the accessor async and auto-apply migrations on first use, so `npm run dev` works on a fresh clone without any setup step. `scripts/migrate.ts` verified against PGlite ✓ | D-07 |
| 2.5 | YouCam layer: `concerns.ts` (SD/HD actions, unit costs, error copy), `client.ts` (File API → PUT → task → poll), `parse.ts`, `mock.ts` (persona + seeded noise, generated masks, 3s latency), factory `index.ts` | D-08 |
| 2.6 | Pure domain modules: `domain/noise.ts`, `domain/ingredients.ts` (+ `data/actives.ts`, `data/conflicts.ts`), `domain/trial.ts` | D-03, D-04, D-05 |
| 2.7 | Vitest suites (noise, ingredients, trial, YouCam parsing incl. the documented sample) → **27/27 passing**; renamed config to `vitest.config.mts` to silence Vite's ESM warning | D-18 |
| 2.8 | Services: users (cookie identity), images (sharp normalize), usage (unit meter), noise (idempotent recompute from all calibration pairs), scans (create, lazy poll with transactional claim, masks copy, compare, progress), products, trials, diary, brand (k≥3) | D-09, D-10, D-14 |
| 2.9 | `lib/claude.ts` — label photo → `messages.parse` + Zod; URL → `web_fetch` server tool then parse; pasted INCI is deterministic (no LLM) | D-11, D-13 |
| 2.10 | Agent: 9 `betaZodTool`s scoped to the user, byte-stable system prompt, tool runner with `fallbacks: "default"`, `thread: false` (plain Messages API, no message-threads beta), plain-text history | D-11, D-12, D-20 |
| 2.11 | 18 Route Handlers under `/api/*` with a shared `handle()` error mapper (domain errors → 400, missing Claude key → 503); agent streams SSE | D-15 |
| 2.12 | `next typegen` + `tsc --noEmit` → clean | — |

## Phase 3 — Frontend

| # | Step | Output |
|---|---|---|
| 3.1 | Design tokens (light + dark) mapped into Tailwind v4 `@theme`; Fraunces display + Geist; shared primitives (`Card`, `Button`, `Badge`, `ScoreRing`, `ChangeChip`, …) | `globals.css`, `components/ui.tsx` |
| 3.2 | Nav: desktop top bar + mobile bottom tab bar + status pills (Demo data / Mock AI / YouCam live) | `components/nav.tsx` |
| 3.3 | Capture flow: live camera with face-oval guide, 3:4 portrait crop, upload fallback, client quality gate (brightness, Laplacian blur, SD/HD eligibility), guided 2-shot calibration | `components/capture-flow.tsx`, `lib/client/quality.ts` |
| 3.4 | Pages: home (three brief moments), scan, scan result (luminance-mask zone overlay, noise-aware deltas, calibration explainer), progress (Recharts + noise band), shelf (slots, clashes, start trial), before-you-buy, trials (verdicts + Verified Result form), breakout (diary + triage), coach (SSE steps), brand insights | `src/app/*` |
| 3.5 | ESLint (React Compiler rules) flagged 4 issues: setState-in-effect ×2, unescaped `'` ×2 → fixed properly, not suppressed | — |
| 3.6 | Demo seed: deterministic demo account (calibration pair, 4 weekly check-ins, 5-product shelf with a deliberate retinol+AHA clash, completed "working" trial, diary) + 6 anonymous community reviews; fictional brands; placeholder illustration labelled DEMO | `scripts/seed-demo.ts` |

## Phase 4 — Build, test, fix

| # | Step | Output |
|---|---|---|
| 4.1 | `next build` **failed**: `usePathname`/`useParams` outside Suspense under Cache Components → wrapped in Suspense (stream option) | D-25 |
| 4.2 | Build log showed GET handlers being prerendered and a swallowed `cookies()` prerender rejection → `connection()` in `handle()` → clean build | D-24 |
| 4.3 | End-to-end API test against the production server (mock YouCam, PGlite): calibration pair → personal bands; 3 concurrent polls → single result; HD-lock rejection; retinol+AHA clash and its removal by moving AHA to AM; pre-purchase skip/not-for-you; single-active-trial guard; review-too-early guard; diary; agent 503 without key; image owner-only (stranger → 404); demo switch; brand k≥3 view; all 10 pages 200 | ✓ |
| 4.4 | Chrome extension unavailable → headless Chrome via `puppeteer-core` (installed in scratch dir only) for desktop + mobile screenshots | `docs/screenshots/` |
| 4.5 | Screenshot run caught a runtime error on `/coach` (effect returning `scrollIntoView`'s Promise) → fixed | D-26 |
| 4.6 | Screenshots revealed noisy demo bands (±2…±16) and a spurious "Spots worse" → analysed (single-pair variance), made seed deterministic | D-27 |
| 4.7 | Copy fix: "Skip it / Skip — you already use retinoid" → "You already use a retinoid (…). Doubling up adds irritation, not results." | — |
| 4.8 | README (judge-facing), MIT LICENSE, LLD folder map updated | D-28 |
| 4.9 | Final: 27/27 tests · `tsc` clean · ESLint clean · `next build` clean | ✓ |

## Phase 5 — Switch to free LLM tiers (Groq / Gemini)

| # | Step | Output |
|---|---|---|
| 5.1 | User request: use the free Groq API or Gemini free tier instead of Claude. Checked current docs: Groq models / vision / structured outputs, Gemini OpenAI compatibility and models | D-29 |
| 5.2 | `npm uninstall @anthropic-ai/sdk` · `npm install openai@7.45.1` | `package.json` |
| 5.3 | Config: `ANTHROPIC_*` → `LLM_PROVIDER`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `LLM_MODEL`, `LLM_VISION_MODEL`, `LLM_BASE_URL` | `src/lib/config.ts`, `.env`, `.env.example` |
| 5.4 | `src/lib/claude.ts` → `src/lib/llm.ts`: provider resolution, strict-JSON-schema extraction with JSON-mode fallback, rate-limit mapping | D-29 |
| 5.5 | `src/lib/fetch-page.ts`: SSRF-guarded page fetch + HTML → text | D-30 |
| 5.6 | Agent: provider-neutral `tool()` helper, hand-written tool-calling loop | D-31 |
| 5.7 | Migration `0001_llm_provider.sql` (`usage_provider += 'llm'`); UI status pill "AI: on (groq)" | `drizzle/` |
| 5.8 | Tests: SSRF rejections, `htmlToText`, `toProductExtract` | `tests/llm.test.ts` |
| 5.9 | End-to-end against a local fake OpenAI-compatible server (`LLM_BASE_URL`): coach streamed `step` → `text` → `done`, with the real tool result passed back. URL check reached the fake model with `json_schema` and returned actives + verdict. | ✓ |
| 5.10 | **Bug:** every public URL was rejected as "private". Node `BlockList` matches IPv4 addresses against the `::ffff:0:0/96` rule → rule removed, allow-list tests added | D-30 |
| 5.11 | Final: 42/42 tests · `tsc` clean · ESLint clean · `next build` clean. Not yet run against real Groq/Gemini (no key in `.env`) | ✓ |

## Phase 6 — First live run on Gemini

| # | Step | Output |
|---|---|---|
| 6.1 | User added `GEMINI_API_KEY`. `npm run dev` → `/api/me` shows `ai: true, aiProvider: gemini` | ✓ |
| 6.2 | Coach turn **timed out** (2.3 min). Direct probe of the key: model list OK; `gemini-3.8-flash` → 503 "high demand" | diagnosis |
| 6.3 | Probed tool calling across Flash models: 3.8 / 3.7 / flash-latest → 503; 3.6 / 3.5 / 2.5 → 200 in 2–3 s | D-32 |
| 6.4 | Default → `gemini-3.6-flash`; `complete()` fallback chain; retries 1, timeout 45 s | `src/lib/llm.ts`, `src/lib/agent/run.ts` |
| 6.5 | Live: coach 17 s (4 tools, respects noise band) · label photo 9 s (8/8 INCI exact) · product URL 10 s. 429s on 3.6/3.5 were absorbed by falling back to 2.5 | ✓ |
| 6.6 | 42/42 tests · `tsc` · ESLint clean | ✓ |

## Phase 7 — First live YouCam scan

| # | Step | Output |
|---|---|---|
| 7.1 | User's first real scan: `GET /api/scans/:id` → 500, unique violation on `(scan_id, skin_type)`. The live output repeats `skin_type` (zones); the docs show no example | D-33 |
| 7.2 | `parseSkinOutput` merges repeated concern items; regression test; log of repeated types for diagnosis | `src/lib/youcam/parse.ts`, `tests/youcam-parse.test.ts` |
| 7.3 | Scan was left `running` by the rollback → the next poll stores it (YouCam keeps results 24 h; units already charged once) | ✓ |
| 7.4 | 43/43 tests · `tsc` clean | ✓ |

## Phase 8 — Developer time travel

| # | Step | Output |
|---|---|---|
| 8.1 | User can't wait 28 days or buy products → asked for a backdate option. Chose "shift my records into the past" over a fake clock | D-34 |
| 8.2 | `users.time_shift_days` + migration `0002_time_shift.sql`; `DEV_TIME_TRAVEL` flag | `src/lib/db/schema.ts`, `src/lib/config.ts` |
| 8.3 | `services/time-travel.ts` (one transaction over 9 tables) + `POST /api/dev/time-travel` | — |
| 8.4 | UI: `components/time-travel.tsx` panel on Trials (+1 / +7 / +14 days); nav badge "Time-shifted +Nd" | — |
| 8.5 | `PGLITE_DIR` override → mock server on a throwaway DB for testing, real DB and units untouched | D-35 |
| 8.6 | Test found an empty id → 500 → `22P02` mapped to 404 in `handle()` | D-35 |
| 8.7 | E2E (Node script): calibration ×2 → trial → +7 scan → +7 scan → +14 scan: verdicts insufficient_data → too_early → no_change → no_change; diary shifted; demo + out-of-range refused | ✓ |
| 8.8 | `.env` → `DEV_TIME_TRAVEL=true` (user's local), `.env.example` → `false` | — |

## Phase 9 — Closing the gaps for a top-3 finish

| # | Step | Output |
|---|---|---|
| 9.1 | Gap review against judging criteria: no proof the method works, raw numbers without meaning, unsafe to deploy publicly, light drift, no global reach, no business story | — |
| 9.2 | Noise ratio + confidence (`noise / likely / clear`) on every comparison and trial concern; "What really changed" card; strength in progress, trials, chips | D-36 · `domain/noise.ts`, `lib/client/labels.ts` |
| 9.3 | Daily per-user caps for live scans and AI calls (→ 429); `maxDuration` on slow routes; PGlite refused on Vercel | D-37 · `services/usage.ts`, `db/client.ts` |
| 9.4 | Live light meter in the camera + warning when brightness drifts > 20% from calibration | D-38 · `client/quality.ts`, `capture-flow.tsx` |
| 9.5 | `experiments` table + `validation` scan context, migration `0003_validation.sql`; validation scans excluded from progress/trials/coach | D-39 · `domain/validation.ts`, `services/experiments.ts` |
| 9.6 | `/evidence` page: method, your bands, three validation tests, summary, honest limits | D-39 |
| 9.7 | Coach "Reply in" picker (10 languages) | D-40 |
| 9.8 | `/report` (printable), `/privacy`, site footer, web manifest + icons, business model + badge preview on `/brand` | D-41 |
| 9.9 | Tests: 50/50 (new `tests/validation.test.ts`) · `tsc`, ESLint, `next build` clean | ✓ |
| 9.10 | E2E on a throwaway DB (mock scans): calibration light = 140; no-change test 13/15 in band → pass; bad kind / reused photo / non-validation scan → 400; progress still 2 scans (validation excluded); new pages 200; coach in Hindi; AI cap 1 → second call 429 | ✓ |

## Phase 10 — Design v2, new features, end-to-end test

| # | Step | Output |
|---|---|---|
| 10.1 | Baseline: 50/50 tests, tsc, ESLint clean. Headless-Chrome tour of every page (desktop + mobile): no console errors; found four pages unreachable on mobile | — |
| 10.2 | Design system v2: tokens, theme toggle, SVG icons, nav "More" + mobile sheet, ⌘K palette, skeletons | D-46 |
| 10.3 | Home: animated noise-band hero (new visitors) and a Today dashboard (score trend, streak, trial, tonight's routine, skin weather) | `app/page.tsx` |
| 10.4 | Routine planner + "Apply to my shelf" | D-42 · `domain/routine.ts`, `tests/routine.test.ts` |
| 10.5 | `/compare`: before/after slider, mask overlay, noise-aware deltas | `app/compare/page.tsx` |
| 10.6 | Proof card PNG + share/download modal on trials | D-43 |
| 10.7 | Skin weather | D-44 · `domain/weather.ts`, `tests/weather.test.ts` |
| 10.8 | Progress: overall score + skin-age chart; scan page: analyzing animation, "compare with first scan" | — |
| 10.9 | Fixes: unhandled rejections on shelf slot/remove, check "add to shelf", trial stop (now confirms); stale breakout error; "— · N ingredients" on pasted products; Next `data-scroll-behavior` warning | — |
| 10.10 | E2E (CDP-driven Chrome, fresh user, mock YouCam, throwaway DB): 22 steps from calibration through trial verdict, review, proof card, compare, coach, palette, theme, data deletion and the mobile sheet | ✓ |
| 10.11 | **Bug found by E2E:** calibration pair never produced a noise profile (first photo left `running`) → `settleRunningScans` | D-45 |
| 10.12 | Final: 62/62 tests · tsc · ESLint · `next build` clean · E2E 22/22 (0 failures) · production `next start` smoke test · screenshots regenerated | ✓ |

