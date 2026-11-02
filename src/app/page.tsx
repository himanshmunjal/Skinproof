"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { Icon, type IconName } from "@/components/icons";
import { SkinWeather } from "@/components/skin-weather";
import { Badge, Button, ButtonLink, Card, ErrorNote, ScoreRing, Skeleton } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fmtDate, label, strength } from "@/lib/client/labels";
import { planRoutine, type RoutineProduct } from "@/lib/domain/routine";

type Me = {
  user: { id: string; isDemo: boolean };
  calibrated: boolean;
  counts: { scans: number; products: number };
  lastScan: { id: string; createdAt: string; overallScore: number | null } | null;
  system: { youcamMock: boolean; ai: boolean; aiProvider: string | null; db: string; units: { used: number; budget: number; remaining: number } };
};
type Progress = {
  /** Client clock when the data arrived (keeps Date.now() out of render). */
  at?: number;
  overall: { t: string; score: number | null; skinAge: number | null }[];
  series: Record<string, { t: string; raw: number; ui: number | null }[]>;
  thresholds: Record<string, number>;
};
type Trial = {
  id: string;
  status: "active" | "completed" | "stopped";
  product: { name: string } | null;
  verdict: { status: string; day: number; perConcern: { concern: string; delta: number; threshold: number; label: string }[] };
};
type Product = RoutineProduct & { onShelf: boolean };

const MOMENTS: { when: string; title: string; body: string; href: string; cta: string; icon: IconName }[] = [
  {
    when: "Right before a purchase",
    title: "Will this work for me?",
    body: "Paste a link or snap the label. Get buy / skip based on your measured skin and what's already on your shelf.",
    href: "/check",
    cta: "Check a product",
    icon: "check",
  },
  {
    when: "Right after a bad breakout",
    title: "What caused this?",
    body: "Scan it, log the last few days, and the coach ranks likely triggers with a gentle plan for tonight.",
    href: "/breakout",
    cta: "Triage a breakout",
    icon: "breakout",
  },
  {
    when: "In front of the mirror",
    title: "Is it actually working?",
    body: "28-day single-product trials with noise-calibrated scans. A verdict you can trust — not a vibe.",
    href: "/trials",
    cta: "See trials",
    icon: "trials",
  },
];

const VERDICT: Record<string, { text: string; tone: "good" | "bad" | "warn" | "noise" | "accent" }> = {
  too_early: { text: "Too early to tell", tone: "noise" },
  working: { text: "Working", tone: "good" },
  no_change: { text: "No measurable change", tone: "warn" },
  worsening: { text: "Worsening", tone: "bad" },
  insufficient_data: { text: "Needs a check-in", tone: "accent" },
};

export default function Home() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<Me>("/api/me")
        .then(setMe)
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => void load(), [load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      window.dispatchEvent(new Event("skinproof:me"));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const useDemo = () =>
    run(async () => {
      await api("/api/me/demo", { method: "POST" });
      router.refresh();
    });
  const fresh = () => run(() => api("/api/me/fresh", { method: "POST" }));
  const wipe = () => {
    if (!window.confirm("Delete all your scans, photos, products, trials and chats? This can't be undone.")) return;
    void run(() => api("/api/me", { method: "DELETE" }));
  };

  const returning = !!me && me.counts.scans > 0;

  return (
    <div className="space-y-12">
      {error && <ErrorNote>{error}</ErrorNote>}
      {!me ? <HomeSkeleton /> : returning ? <Dashboard me={me} key={me.user.id} /> : <Hero me={me} onDemo={useDemo} />}

      <section className="grid gap-4 md:grid-cols-3">
        {MOMENTS.map((m, i) => (
          <Link
            key={m.href}
            href={m.href}
            className="group flex animate-rise flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
              <Icon name={m.icon} />
            </span>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-accent">{m.when}</p>
            <p className="font-display mt-1.5 text-xl font-semibold">{m.title}</p>
            <p className="mt-2 flex-1 text-sm text-muted">{m.body}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
              {m.cta} <Icon name="arrow" className="size-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="relative overflow-hidden">
          <p className="font-medium">Why calibration matters</p>
          <p className="mt-2 text-sm text-muted">
            Two photos of the same face a minute apart never score identically — light, angle and distance move the numbers. SkinProof measures that
            wobble for each concern and draws it as a grey band. A drop in redness that stays inside the band is noise; one that leaves it is real.{" "}
            <Link href="/evidence" className="font-medium text-accent">
              Don&apos;t trust us — test it yourself →
            </Link>
          </p>
        </Card>
        <Card>
          <p className="font-medium">For brands: Verified Results</p>
          <p className="mt-2 text-sm text-muted">
            When a trial ends, users can share a review that carries their measured change. Brands see anonymized, aggregated efficacy — real-world
            evidence instead of star ratings.{" "}
            <Link href="/brand" className="font-medium text-accent">
              See the brand view →
            </Link>
          </p>
        </Card>
      </section>

      {me && (
        <section className="flex flex-wrap items-center gap-3 border-t border-line pt-6 text-sm text-muted">
          <span>{me.user.isDemo ? "You're viewing the shared demo account." : "Your data stays in your account."}</span>
          {me.user.isDemo ? (
            <Button variant="secondary" onClick={fresh}>
              Leave demo — start my own
            </Button>
          ) : (
            <>
              {returning && (
                <Button variant="secondary" onClick={useDemo}>
                  View demo data
                </Button>
              )}
              <Button variant="danger" onClick={wipe}>
                Delete all my data
              </Button>
            </>
          )}
          <span className="ml-auto text-[11px]">
            {me.system.youcamMock ? "YouCam: mock mode (0 units)" : `YouCam units: ${me.system.units.remaining}/${me.system.units.budget} left`} · AI:{" "}
            {me.system.ai ? `on (${me.system.aiProvider})` : "off"} · DB: {me.system.db}
          </span>
        </section>
      )}
    </div>
  );
}

/* ───────────────────────── First visit ───────────────────────── */

function Hero({ me, onDemo }: { me: Me; onDemo: () => void }) {
  return (
    <section className="grid items-center gap-10 pt-2 lg:grid-cols-[1.15fr_1fr]">
      <div className="animate-rise">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-muted shadow-card backdrop-blur">
          <span className="size-1.5 animate-pulse rounded-full bg-accent" /> Powered by YouCam AI Skin Analysis · 15 concerns
        </span>
        <h1 className="font-display mt-5 text-5xl font-semibold leading-[1.02] sm:text-6xl">
          You spent $60 on a serum.
          <br />
          <span className="text-gradient">Is it working?</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted">
          SkinProof learns how much <em>your</em> skin scores wobble on their own, then only tells you something changed when it really did. Measured,
          not guessed.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          <ButtonLink href="/scan" className="px-5 py-3 text-base">
            Start: 2-photo calibration <Icon name="arrow" className="size-4" />
          </ButtonLink>
          {!me.user.isDemo && (
            <Button variant="secondary" onClick={onDemo} className="px-5 py-3 text-base">
              Explore with demo data
            </Button>
          )}
        </div>
        <div className="mt-8 grid max-w-lg grid-cols-3 gap-3 text-sm">
          {[
            ["±1.96σ", "personal noise band per concern"],
            ["28 days", "single-product trials"],
            ["0 guesses", "rules decide clashes, not AI"],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="font-display text-2xl font-semibold">{k}</div>
              <div className="text-xs text-muted">{v}</div>
            </div>
          ))}
        </div>
      </div>
      <NoiseHero />
    </section>
  );
}

/** Animated explainer: dots inside the grey band are noise; the ones that leave it are a real change. */
function NoiseHero() {
  const pts: [number, number, boolean][] = [
    [40, 132, false],
    [92, 142, false],
    [144, 121, false],
    [196, 137, false],
    [248, 116, false],
    [300, 86, true],
    [352, 62, true],
  ];
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  return (
    <div className="relative animate-rise [animation-delay:120ms]">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-accent/25 via-transparent to-accent-2/25 blur-2xl" />
      <Card className="relative overflow-hidden p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Redness · 6 scans</p>
            <p className="font-display mt-1 text-lg font-semibold">Niacinamide trial, week 4</p>
          </div>
          <Badge tone="good">▲ 2.3× · real</Badge>
        </div>
        <svg viewBox="0 0 400 210" className="mt-3 w-full" role="img" aria-label="Chart: scores inside the noise band are noise, the last two leave it">
          <defs>
            <linearGradient id="hero-line" x1="0" x2="1">
              <stop offset="0" stopColor="var(--noise)" />
              <stop offset="0.6" stopColor="var(--accent)" />
              <stop offset="1" stopColor="var(--accent-2)" />
            </linearGradient>
          </defs>
          <rect x="16" y="104" width="368" height="56" rx="8" fill="var(--noise)" opacity="0.14" />
          <line x1="16" x2="384" y1="132" y2="132" stroke="var(--noise)" strokeDasharray="4 5" />
          <text x="24" y="176" fontSize="11" fill="var(--muted)">
            your noise band ±3.7
          </text>
          <path
            d={d}
            fill="none"
            stroke="url(#hero-line)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            className="[animation:draw_1.8s_0.3s_cubic-bezier(0.4,0,0.2,1)_both]"
          />
          {pts.map(([x, y, real], i) => (
            <g key={i} className="animate-fade" style={{ animationDelay: `${0.3 + i * 0.22}s` }}>
              {real && <circle cx={x} cy={y} r="11" fill="var(--accent)" opacity="0.18" className="animate-pulse" />}
              <circle cx={x} cy={y} r={real ? 5.5 : 4.5} fill={real ? "var(--accent)" : "var(--noise)"} stroke="var(--surface)" strokeWidth="2" />
            </g>
          ))}
          <g className="animate-fade" style={{ animationDelay: "1.9s" }}>
            <rect x="248" y="22" width="132" height="26" rx="13" fill="var(--accent)" />
            <text x="314" y="39" fontSize="11.5" fontWeight="600" fill="var(--accent-ink)" textAnchor="middle">
              Real change ▲ 9 pts
            </text>
            <rect x="74" y="74" width="92" height="22" rx="11" fill="var(--surface-2)" />
            <text x="120" y="89" fontSize="10.5" fill="var(--muted)" textAnchor="middle">
              within noise
            </text>
          </g>
        </svg>
        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center text-xs">
          <div>
            <div className="font-display text-xl font-semibold text-good">2</div>
            <div className="text-muted">real changes</div>
          </div>
          <div>
            <div className="font-display text-xl font-semibold">13</div>
            <div className="text-muted">within noise</div>
          </div>
          <div>
            <div className="font-display text-xl font-semibold text-gradient">Working</div>
            <div className="text-muted">verdict</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ───────────────────────── Returning user ───────────────────────── */

function Dashboard({ me }: { me: Me }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [trials, setTrials] = useState<Trial[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    api<Progress>("/api/progress")
      .then((d) => setProgress({ ...d, at: Date.now() }))
      .catch(() => setProgress({ overall: [], series: {}, thresholds: {}, at: Date.now() }));
    api<{ trials: Trial[] }>("/api/trials").then((d) => setTrials(d.trials)).catch(() => setTrials([]));
    api<{ products: Product[] }>("/api/products").then((d) => setProducts(d.products.filter((p) => p.onShelf))).catch(() => setProducts([]));
  }, []);

  const stats = useMemo(() => {
    if (!progress) return null;
    const scored = progress.overall.filter((o) => o.score !== null);
    const first = scored[0];
    const last = scored.at(-1);
    // Strongest real change since the baseline (mean of first two scans), in units of the noise band.
    const changes = Object.entries(progress.series)
      .filter(([, pts]) => pts.length > 2)
      .map(([c, pts]) => {
        const base = (pts[0].raw + pts[1].raw) / 2;
        const delta = pts.at(-1)!.raw - base;
        return { concern: c, delta, st: strength(delta, progress.thresholds[c] ?? 6) };
      })
      .filter((x) => x.st.level !== "noise")
      .sort((a, b) => b.st.ratio - a.st.ratio);
    const weakest = Object.entries(progress.series)
      .map(([c, pts]) => [c, pts.at(-1)?.ui ?? 100] as const)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(([c]) => c);
    // Streak = consecutive weeks (ending this week or last) with at least one scan.
    const weekOf = (t: string) => Math.floor(new Date(t).getTime() / (7 * 86_400_000));
    const weeks = new Set(progress.overall.map((o) => weekOf(o.t)));
    const now = progress.at ?? 0;
    let w = weekOf(new Date(now).toISOString());
    if (!weeks.has(w)) w--;
    let streak = 0;
    while (weeks.has(w)) {
      streak++;
      w--;
    }
    const daysSince = last ? Math.max(0, Math.floor((now - new Date(last.t).getTime()) / 86_400_000)) : null;
    return { first, last, changes, weakest, streak, daysSince, chart: scored.map((o) => ({ t: fmtDate(o.t), score: Math.round(o.score!) })) };
  }, [progress]);

  const trial = trials?.find((t) => t.status === "active") ?? trials?.[0] ?? null;
  const plan = useMemo(() => (products ? planRoutine(products) : null), [products]);
  const today = (new Date().getDay() + 6) % 7;
  const tonight = plan?.nights[plan.week[today]?.night ?? 0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const shelfActives = [...new Set((products ?? []).filter((p) => p.slot !== "none").flatMap((p) => p.actives.map((a) => a.active)))];

  return (
    <section className="space-y-5">
      <div className="flex animate-rise flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="font-display text-4xl font-semibold sm:text-5xl">{greeting}.</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/scan?type=checkin">
            <Icon name="scan" className="size-4" /> Check-in scan
          </ButtonLink>
          <ButtonLink href="/compare" variant="secondary">
            <Icon name="compare" className="size-4" /> Compare
          </ButtonLink>
          <ButtonLink href="/coach" variant="secondary">
            <Icon name="coach" className="size-4" /> Coach
          </ButtonLink>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Score + trend */}
        <Card className="animate-rise lg:col-span-2">
          {!stats ? (
            <Skeleton className="h-44" />
          ) : (
            <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
              <div className="flex items-center gap-5 sm:flex-col sm:items-start">
                <ScoreRing value={stats.last?.score == null ? null : Math.round(stats.last.score)} size={112} label="skin score" />
                <div className="space-y-1 text-sm">
                  {stats.last?.skinAge != null && (
                    <p>
                      Skin age <strong className="font-display text-lg">{stats.last.skinAge}</strong>
                    </p>
                  )}
                  {stats.first?.score != null && stats.last?.score != null && stats.first !== stats.last && (
                    <p className="text-muted">
                      {Math.abs(stats.last.score - stats.first.score) < 0.5
                        ? `Steady since ${fmtDate(stats.first.t)}`
                        : `${stats.last.score > stats.first.score ? "+" : ""}${(stats.last.score - stats.first.score).toFixed(1)} since ${fmtDate(stats.first.t)}`}
                    </p>
                  )}
                  <Link href={`/scans/${me.lastScan?.id}`} className="text-xs font-medium text-accent">
                    Latest scan →
                  </Link>
                </div>
              </div>
              <div className="min-w-0">
                <div className="h-28 w-full">
                  {stats.chart.length > 1 && (
                    <ResponsiveContainer>
                      <AreaChart data={stats.chart} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                        <defs>
                          <linearGradient id="dash-area" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <YAxis hide domain={["dataMin - 3", "dataMax + 3"]} />
                        <Tooltip
                          contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }}
                          labelFormatter={(_, p) => p?.[0]?.payload?.t ?? ""}
                          formatter={(v) => [v, "Skin score"]}
                        />
                        <Area type="monotone" dataKey="score" stroke="var(--accent)" strokeWidth={2.5} fill="url(#dash-area)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Real changes since your baseline</p>
                {stats.changes.length === 0 ? (
                  <p className="mt-1 text-sm text-muted">Nothing has left your noise band yet. Keep scanning weekly.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {stats.changes.slice(0, 4).map((c) => (
                      <Badge key={c.concern} tone={c.delta > 0 ? "good" : "bad"}>
                        {label(c.concern)} {c.delta > 0 ? "▲" : "▼"} {c.st.ratio.toFixed(1)}×
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Check-in cadence */}
        <Card className="flex animate-rise flex-col [animation-delay:60ms]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Weekly check-in</p>
          {!stats ? (
            <Skeleton className="mt-3 h-28" />
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-5xl font-semibold">{stats.streak}</span>
                <span className="text-sm text-muted">week streak</span>
                <Icon name="flame" className={`size-5 ${stats.streak > 1 ? "text-accent-2" : "text-muted"}`} />
              </div>
              <p className="mt-2 flex-1 text-sm text-muted">
                {stats.daysSince === null
                  ? "No scans yet."
                  : stats.daysSince >= 7
                    ? `Last scan ${stats.daysSince} days ago — a check-in is due.`
                    : stats.daysSince === 0
                      ? "Scanned today. Next check-in in 7 days."
                      : `Last scan ${stats.daysSince} day${stats.daysSince === 1 ? "" : "s"} ago. Next one in ${7 - stats.daysSince}.`}
              </p>
              <ButtonLink href="/scan?type=checkin" variant={stats.daysSince !== null && stats.daysSince >= 7 ? "primary" : "secondary"} className="mt-3">
                {stats.daysSince !== null && stats.daysSince >= 7 ? "Check in now" : "Scan anyway"}
              </ButtonLink>
            </>
          )}
        </Card>

        {/* Trial */}
        <Card className="flex animate-rise flex-col [animation-delay:120ms]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{trial?.status === "active" ? "Active trial" : "Latest trial"}</p>
          {!trials ? (
            <Skeleton className="mt-3 h-28" />
          ) : trial ? (
            <>
              <div className="mt-3 flex items-center gap-4">
                <ScoreRing value={Math.min(28, trial.verdict.day)} max={28} size={72} label="day" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{trial.product?.name ?? "Product"}</p>
                  <Badge tone={(VERDICT[trial.verdict.status] ?? VERDICT.too_early).tone} className="mt-1">
                    {(VERDICT[trial.verdict.status] ?? VERDICT.too_early).text}
                  </Badge>
                </div>
              </div>
              <div className="mt-3 flex-1 space-y-1 text-sm">
                {trial.verdict.perConcern.slice(0, 2).map((c) => (
                  <p key={c.concern} className="flex justify-between gap-2">
                    <span className="text-muted">{label(c.concern)}</span>
                    <span className={c.label === "improved" ? "text-good" : c.label === "worse" ? "text-bad" : "text-muted"}>
                      {c.delta >= 0 ? "+" : ""}
                      {c.delta.toFixed(1)} {c.label === "within_noise" ? "(noise)" : ""}
                    </span>
                  </p>
                ))}
              </div>
              <Link href="/trials" className="mt-3 text-sm font-medium text-accent">
                Open trial →
              </Link>
            </>
          ) : (
            <>
              <p className="mt-3 flex-1 text-sm text-muted">Pick one product on your shelf and test it for 28 days. You&apos;ll get a measured verdict.</p>
              <ButtonLink href="/shelf" variant="secondary" className="mt-3">
                Start a trial
              </ButtonLink>
            </>
          )}
        </Card>

        {/* Tonight's routine */}
        <Card className="flex animate-rise flex-col [animation-delay:180ms]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Tonight{tonight && plan && plan.nights.length > 1 ? ` · ${tonight.label}` : ""}</p>
          {!plan ? (
            <Skeleton className="mt-3 h-28" />
          ) : tonight && tonight.steps.length ? (
            <>
              <ol className="mt-3 flex-1 space-y-1.5">
                {tonight.steps.slice(0, 4).map((s, i) => (
                  <li key={s.productId} className="flex items-center gap-2.5 text-sm">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  </li>
                ))}
              </ol>
              <Link href="/shelf#routine" className="mt-3 text-sm font-medium text-accent">
                {plan.clashesBefore > 0 ? `Resolves ${plan.clashesBefore} clash${plan.clashesBefore > 1 ? "es" : ""} →` : "Full routine →"}
              </Link>
            </>
          ) : (
            <>
              <p className="mt-3 flex-1 text-sm text-muted">Add products to your shelf to get a clash-free AM/PM routine.</p>
              <ButtonLink href="/shelf" variant="secondary" className="mt-3">
                Go to shelf
              </ButtonLink>
            </>
          )}
        </Card>

        <div className="animate-rise [animation-delay:240ms]">
          <SkinWeather shelfActives={shelfActives} weakest={stats?.weakest ?? []} />
        </div>
      </div>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-3/4" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
