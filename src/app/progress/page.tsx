"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, ButtonLink, Card, Empty, ErrorNote, PageHeader, PageLoading, Stat } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fmtDate, label, strength } from "@/lib/client/labels";

type Point = { t: string; scanId: string; raw: number; ui: number | null; context: string };
type Progress = {
  mode: "sd" | "hd" | null;
  series: Record<string, Point[]>;
  overall: { t: string; score: number | null; skinAge: number | null }[];
  thresholds: Record<string, number>;
  calibrated: boolean;
};

export default function ProgressPage() {
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [concern, setConcern] = useState<string | null>(null);

  useEffect(() => {
    api<Progress>("/api/progress")
      .then((d) => {
        setData(d);
        // Default to the concern with the largest movement relative to its noise band.
        const ranked = Object.entries(d.series)
          .filter(([, pts]) => pts.length > 1)
          .map(([c, pts]) => [c, Math.abs(pts[pts.length - 1].raw - pts[0].raw) / (d.thresholds[c] ?? 6)] as const)
          .sort((a, b) => b[1] - a[1]);
        setConcern(ranked[0]?.[0] ?? Object.keys(d.series)[0] ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  const summary = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.series)
      .filter(([, pts]) => pts.length > 1)
      .map(([c, pts]) => {
        const base = pts.slice(0, 2).reduce((s, p) => s + p.raw, 0) / Math.min(2, pts.length);
        const last = pts[pts.length - 1].raw;
        const delta = last - base;
        const th = data.thresholds[c] ?? 6;
        return { concern: c, delta, th, label: delta > th ? "improved" : delta < -th ? "worse" : "within_noise" };
      })
      .sort((a, b) => Math.abs(b.delta) / b.th - Math.abs(a.delta) / a.th);
  }, [data]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <PageLoading />;
  if (!data.overall.length)
    return (
      <>
        <PageHeader title="Progress" />
        <Empty title="No scans yet" body="Start with the 2-photo calibration — it becomes your baseline." action={<ButtonLink href="/scan">Calibrate now</ButtonLink>} />
      </>
    );

  const pts = concern ? data.series[concern] ?? [] : [];
  const th = concern ? data.thresholds[concern] ?? 6 : 6;
  const baseline = pts.length ? pts.slice(0, 2).reduce((s, p) => s + p.raw, 0) / Math.min(2, pts.length) : 0;
  const chartData = pts.map((p) => ({ ...p, label: fmtDate(p.t), raw: Math.round(p.raw * 10) / 10 }));
  const lo = Math.floor(Math.min(baseline - th, ...pts.map((p) => p.raw)) - 3);
  const hi = Math.ceil(Math.max(baseline + th, ...pts.map((p) => p.raw)) + 3);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Noise-aware"
        title="Progress"
        subtitle={
          <>
            {data.overall.length} scans · {data.mode?.toUpperCase()} analysis ·{" "}
            {data.calibrated ? "personal noise bands" : <span className="text-warn">default ±6 bands (calibrate for personal ones)</span>}
          </>
        }
        action={
          <div className="flex gap-2">
            <ButtonLink href="/compare" variant="secondary">
              Compare
            </ButtonLink>
            <ButtonLink href="/report" variant="secondary">
              Report
            </ButtonLink>
            <ButtonLink href="/scan?type=checkin">New check-in</ButtonLink>
          </div>
        }
      />

      <OverallCard overall={data.overall} />

      <Card>
        <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          {Object.keys(data.series).map((c) => (
            <button
              key={c}
              onClick={() => setConcern(c)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs transition ${concern === c ? "bg-ink text-bg" : "bg-surface-2 text-muted hover:text-ink"}`}
            >
              {label(c)}
            </button>
          ))}
        </div>
        {concern && (
          <>
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                  <YAxis domain={[lo, hi]} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                  <ReferenceArea y1={baseline - th} y2={baseline + th} fill="var(--noise)" fillOpacity={0.14} ifOverflow="extendDomain" />
                  <ReferenceLine y={baseline} stroke="var(--noise)" strokeDasharray="4 4" />
                  <Tooltip
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }}
                    formatter={(v) => [v, `${label(concern)} (raw)`]}
                  />
                  <Line type="monotone" dataKey="raw" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3.5, fill: "var(--accent)" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted">
              Grey band = your baseline ± {th.toFixed(1)} (95% measurement noise for {label(concern).toLowerCase()}). Points outside it are real change. Higher is healthier.
            </p>
          </>
        )}
      </Card>

      {summary.length > 0 && (
        <Card className="p-0 sm:p-0">
          <h2 className="border-b border-line px-4 py-3 text-sm font-medium">Since your baseline</h2>
          <ul className="divide-y divide-line">
            {summary.map((s) => (
              <li key={s.concern} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <button className="font-medium hover:underline" onClick={() => setConcern(s.concern)}>
                  {label(s.concern)}
                </button>
                <span className="flex items-center gap-2 text-xs text-muted" title={strength(s.delta, s.th).text}>
                  {s.delta >= 0 ? "+" : ""}
                  {s.delta.toFixed(1)} / ±{s.th.toFixed(1)}
                  {s.label !== "within_noise" && <span>· {strength(s.delta, s.th).ratio.toFixed(1)}×</span>}
                  <Badge tone={s.label === "improved" ? "good" : s.label === "worse" ? "bad" : "noise"}>
                    {s.label === "within_noise" ? "within noise" : s.label}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-0 sm:p-0">
        <h2 className="border-b border-line px-4 py-3 text-sm font-medium">Scan log</h2>
        <ul className="divide-y divide-line text-sm">
          {[...(data.series[concern ?? ""] ?? [])].reverse().map((p) => (
            <li key={p.scanId}>
              <Link href={`/scans/${p.scanId}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-2">
                <span>{fmtDate(p.t)}</span>
                <Badge>{p.context}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** Overall YouCam score and skin age over time — the "headline" trend above the per-concern detail. */
function OverallCard({ overall }: { overall: Progress["overall"] }) {
  const pts = overall.filter((o) => o.score !== null).map((o) => ({ label: fmtDate(o.t), score: Math.round(o.score! * 10) / 10, age: o.skinAge }));
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const ages = pts.filter((p) => p.age !== null);
  return (
    <Card className="grid gap-4 md:grid-cols-[14rem_1fr]">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
        <Stat label="Overall score" value={Math.round(last.score)} sub={`${last.score - first.score >= 0 ? "+" : ""}${(last.score - first.score).toFixed(1)} since ${first.label}`} />
        {ages.length > 0 && <Stat label="Skin age" value={ages[ages.length - 1].age} sub={ages.length > 1 ? `was ${ages[0].age} on ${ages[0].label}` : undefined} />}
      </div>
      <div className="h-44 min-w-0">
        <ResponsiveContainer>
          <LineChart data={pts} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="s" domain={["dataMin - 4", "dataMax + 4"]} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="a" orientation="right" hide domain={["dataMin - 4", "dataMax + 4"]} />
            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }} />
            <Line yAxisId="s" type="monotone" dataKey="score" name="Overall score" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line yAxisId="a" type="monotone" dataKey="age" name="Skin age" stroke="var(--accent-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
