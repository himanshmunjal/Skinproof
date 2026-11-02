"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, ButtonLink, Card, Empty, ErrorNote, PageHeader, PageLoading } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fmtDate, label, strength } from "@/lib/client/labels";

type Score = { concern: string; uiScore: number | null; rawScore: number | null; maskImageId: string | null };
type Scan = {
  id: string;
  imageId: string;
  mode: "sd" | "hd";
  status: string;
  context: string;
  overallScore: number | null;
  skinAge: number | null;
  createdAt: string;
  scores: Score[];
};

const DEFAULT_BAND = 6;

export default function ComparePage() {
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [concern, setConcern] = useState<string | null>(null);
  const [pos, setPos] = useState(50);

  useEffect(() => {
    Promise.all([api<{ scans: Scan[] }>("/api/scans?limit=100"), api<{ thresholds: Record<string, number> }>("/api/progress")])
      .then(([s, p]) => {
        const ok = s.scans.filter((x) => x.status === "success" && x.context !== "validation");
        const mode = ok[0]?.mode;
        const usable = ok.filter((x) => x.mode === mode).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
        setScans(usable);
        setThresholds(p.thresholds ?? {});
        const q = new URLSearchParams(window.location.search);
        const qa = q.get("a");
        const qb = q.get("b");
        setA(usable.some((x) => x.id === qa) ? qa : (usable[0]?.id ?? null));
        setB(usable.some((x) => x.id === qb) ? qb : (usable.at(-1)?.id ?? null));
      })
      .catch((e) => setError(e.message));
  }, []);

  const before = scans?.find((s) => s.id === a) ?? null;
  const after = scans?.find((s) => s.id === b) ?? null;

  const rows = useMemo(() => {
    if (!before || !after) return [];
    const bm = new Map(before.scores.map((s) => [s.concern, s]));
    return after.scores
      .filter((s) => s.concern !== "skin_type" && s.rawScore !== null && bm.get(s.concern)?.rawScore != null)
      .map((s) => {
        const delta = (s.rawScore ?? 0) - (bm.get(s.concern)!.rawScore ?? 0);
        const th = thresholds[s.concern] ?? DEFAULT_BAND;
        return { concern: s.concern, before: bm.get(s.concern)!.uiScore, after: s.uiScore, delta, th, st: strength(delta, th) };
      })
      .sort((x, y) => Math.abs(y.delta) / y.th - Math.abs(x.delta) / x.th);
  }, [before, after, thresholds]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!scans) return <PageLoading />;
  if (scans.length < 2)
    return (
      <>
        <PageHeader eyebrow="Before / after" title="Compare scans" />
        <Empty
          title="You need two scans to compare"
          body="Take the 2-photo calibration and you'll have your first pair — then every check-in can be compared against it."
          action={<ButtonLink href="/scan">Take a scan</ButtonLink>}
        />
      </>
    );

  const maskOf = (s: Scan | null) => (concern ? s?.scores.find((x) => x.concern === concern)?.maskImageId : null);
  const days = before && after ? Math.round((new Date(after.createdAt).getTime() - new Date(before.createdAt).getTime()) / 86_400_000) : 0;
  const real = rows.filter((r) => r.st.level !== "noise");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Before / after"
        title="Compare scans"
        subtitle="Drag the slider across your face. Pick a concern to overlay where YouCam found it, on both photos. Only changes outside your noise band count."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <ScanPicker label="Before" scans={scans} value={a} onChange={setA} />
            <ScanPicker label="After" scans={scans} value={b} onChange={setB} />
          </div>

          <div className="relative aspect-[3/4] select-none overflow-hidden rounded-3xl bg-black shadow-lift">
            {after && <Photo scan={after} mask={maskOf(after)} />}
            {before && (
              <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
                <Photo scan={before} mask={maskOf(before)} />
              </div>
            )}
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_12px_rgb(0_0_0/0.5)]" style={{ left: `${pos}%` }}>
              <div className="absolute left-1/2 top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-black shadow-lift">
                <Icon name="compare" className="size-5" />
              </div>
            </div>
            <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white backdrop-blur">
              Before · {before ? fmtDate(before.createdAt) : ""}
            </span>
            <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white backdrop-blur">
              After · {after ? fmtDate(after.createdAt) : ""}
            </span>
            {concern && (
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur">
                {label(concern)} zones
              </span>
            )}
            <input
              type="range"
              min={0}
              max={100}
              value={pos}
              onChange={(e) => setPos(Number(e.target.value))}
              aria-label="Before / after slider"
              className="absolute inset-0 size-full cursor-ew-resize opacity-0"
            />
          </div>

          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <Chip on={!concern} onClick={() => setConcern(null)}>
              Photo only
            </Chip>
            {rows.map((r) => (
              <Chip key={r.concern} on={concern === r.concern} onClick={() => setConcern(r.concern)}>
                {label(r.concern)}
              </Chip>
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="grid grid-cols-3 gap-4">
            <Big label="Time apart" value={`${days} day${days === 1 ? "" : "s"}`} />
            <Big
              label="Overall"
              value={
                before?.overallScore != null && after?.overallScore != null
                  ? `${Math.round(before.overallScore)} → ${Math.round(after.overallScore)}`
                  : "–"
              }
            />
            <Big label="Real changes" value={`${real.length} of ${rows.length}`} accent />
          </Card>

          <Card className="p-0 sm:p-0">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-medium">Concern by concern</h2>
              <span className="text-xs text-muted">sorted by strength vs. your noise</span>
            </div>
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const tone = r.st.level === "noise" ? "noise" : r.delta > 0 ? "good" : "bad";
                const width = Math.min(100, (Math.abs(r.delta) / (r.th * 3)) * 100);
                return (
                  <li key={r.concern}>
                    <button
                      onClick={() => setConcern(concern === r.concern ? null : r.concern)}
                      className={`grid w-full grid-cols-[6.5rem_1fr_auto] items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-surface-2 ${concern === r.concern ? "bg-accent-soft/40" : ""}`}
                      title={r.st.text}
                    >
                      <span className="font-medium">{label(r.concern)}</span>
                      <span className="relative h-2 rounded-full bg-surface-2">
                        {/* noise band = the middle third */}
                        <span className="absolute inset-y-0 left-1/3 w-1/3 bg-noise/20" />
                        <span className="absolute inset-y-0 left-1/2 w-px bg-noise/60" />
                        <span
                          className={`absolute inset-y-0 rounded-full ${tone === "good" ? "bg-good" : tone === "bad" ? "bg-bad" : "bg-noise"}`}
                          style={r.delta >= 0 ? { left: "50%", width: `${width / 2}%` } : { right: "50%", width: `${width / 2}%` }}
                        />
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="w-14 text-right text-xs tabular-nums text-muted">
                          {r.before} → {r.after}
                        </span>
                        <Badge tone={tone}>
                          {r.st.level === "noise" ? "noise" : `${r.delta > 0 ? "▲" : "▼"} ${r.st.ratio.toFixed(1)}×`}
                        </Badge>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
              Shaded middle = your personal noise band. Bars that reach past it are changes SkinProof is willing to call real.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Photo({ scan, mask }: { scan: Scan; mask?: string | null }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/images/${scan.imageId}`} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />
      {mask && (
        <div
          aria-hidden
          className="absolute inset-0 animate-fade"
          style={{
            background: "rgb(255 72 120 / 0.85)",
            maskImage: `url(/api/images/${mask})`,
            maskMode: "luminance",
            maskSize: "cover",
            maskPosition: "center",
            maskRepeat: "no-repeat",
          }}
        />
      )}
    </>
  );
}

function ScanPicker({ label: l, scans, value, onChange }: { label: string; scans: Scan[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <label className="text-xs font-medium text-muted">
      {l}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      >
        {scans.map((s) => (
          <option key={s.id} value={s.id}>
            {fmtDate(s.createdAt)} · {s.context}
            {s.overallScore != null ? ` · ${Math.round(s.overallScore)}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs transition ${on ? "bg-ink text-bg" : "bg-surface-2 text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function Big({ label: l, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{l}</div>
      <div className={`font-display mt-1 text-2xl font-semibold tabular-nums ${accent ? "text-gradient" : ""}`}>{value}</div>
    </div>
  );
}
