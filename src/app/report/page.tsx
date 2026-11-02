"use client";

import { useEffect, useState } from "react";
import type { Conflict } from "@/components/conflict-list";
import { Button, ButtonLink, Card, Empty, ErrorNote, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fmtDate, label, strength } from "@/lib/client/labels";

type Progress = {
  mode: "sd" | "hd" | null;
  series: Record<string, { t: string; raw: number; ui: number | null }[]>;
  overall: { t: string; score: number | null; skinAge: number | null }[];
  thresholds: Record<string, number>;
  calibrated: boolean;
};
type Product = { id: string; name: string; brand: string | null; slot: string; onShelf: boolean; actives: { label: string }[]; createdAt: string };
type Trial = {
  id: string;
  status: string;
  startAt: string;
  product: { name: string; brand: string | null } | null;
  verdict: { status: string; day: number; perConcern: { concern: string; delta: number; threshold: number; label: string }[] };
};

const VERDICT: Record<string, string> = {
  too_early: "Too early",
  working: "Measured improvement",
  no_change: "No measurable change",
  worsening: "Measured worsening",
  insufficient_data: "Not enough scans",
};

/** One printable page for a dermatologist appointment: measured history, current routine, trial outcomes. */
export default function ReportPage() {
  const [data, setData] = useState<{ progress: Progress; products: Product[]; conflicts: Conflict[]; trials: Trial[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Progress>("/api/progress"),
      api<{ products: Product[]; conflicts: Conflict[] }>("/api/products"),
      api<{ trials: Trial[] }>("/api/trials"),
    ])
      .then(([progress, shelf, t]) => setData({ progress, products: shelf.products, conflicts: shelf.conflicts, trials: t.trials }))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6 text-accent" />
      </div>
    );
  const { progress, products, conflicts, trials } = data;
  if (!progress.overall.length) {
    return <Empty title="No scans to report yet" body="Take a calibration and a few check-ins first." action={<ButtonLink href="/scan">Scan now</ButtonLink>} />;
  }

  const first = progress.overall[0];
  const last = progress.overall[progress.overall.length - 1];
  const rows = Object.entries(progress.series)
    .filter(([, pts]) => pts.length > 0)
    .map(([concern, pts]) => {
      const base = pts.slice(0, 2).reduce((s, p) => s + p.raw, 0) / Math.min(2, pts.length);
      const now = pts[pts.length - 1];
      const th = progress.thresholds[concern] ?? 6;
      const delta = now.raw - base;
      return { concern, ui: now.ui, delta, th, s: strength(delta, th), n: pts.length };
    })
    .sort((a, b) => (a.ui ?? 0) - (b.ui ?? 0));
  const shelf = products.filter((p) => p.onShelf);

  return (
    <article className="mx-auto max-w-3xl space-y-5 print:max-w-none print:space-y-3 print:text-[11px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">SkinProof · measured skin history</p>
          <h1 className="font-display text-2xl font-semibold">Report for my dermatologist</h1>
          <p className="text-sm text-muted">
            {fmtDate(first.t)} – {fmtDate(last.t)} · {progress.overall.length} scans · YouCam AI Skin Analysis ({progress.mode?.toUpperCase()}) ·{" "}
            {progress.calibrated ? "personal noise bands" : "default ±6 bands (not calibrated)"}
          </p>
        </div>
        <Button onClick={() => window.print()} className="print:hidden">
          Print / save as PDF
        </Button>
      </div>

      <Card className="grid grid-cols-3 gap-3 text-center print:border-0 print:p-0">
        <Stat label="Overall score" value={last.score === null ? "–" : Math.round(last.score)} sub={first.score === null ? undefined : `was ${Math.round(first.score)}`} />
        <Stat label="Skin age" value={last.skinAge ?? "–"} sub={first.skinAge === null ? undefined : `was ${first.skinAge}`} />
        <Stat label="Products in use" value={shelf.length} />
      </Card>

      <section>
        <h2 className="mb-2 font-medium">Concerns — latest score and change since baseline</h2>
        <table className="w-full text-left text-sm print:text-[11px]">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-1.5 font-normal">Concern</th>
              <th className="py-1.5 font-normal">Score (1–100)</th>
              <th className="py-1.5 font-normal">Change</th>
              <th className="py-1.5 font-normal">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.concern} className="border-b border-line/60 align-top">
                <td className="py-1.5 font-medium">{label(r.concern)}</td>
                <td className="py-1.5 tabular-nums">{r.ui ?? "–"}</td>
                <td className="py-1.5 tabular-nums">
                  {r.n > 1 ? `${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(1)} (±${r.th.toFixed(1)})` : "baseline only"}
                </td>
                <td className="py-1.5 text-muted">{r.n > 1 ? (r.s.level === "noise" ? "within noise" : r.delta > 0 ? `better · ${r.s.ratio.toFixed(1)}×` : `worse · ${r.s.ratio.toFixed(1)}×`) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-muted">Higher score = healthier-looking. A change counts only beyond the ± noise band measured for this person.</p>
      </section>

      <section>
        <h2 className="mb-2 font-medium">Current routine</h2>
        {shelf.length === 0 ? (
          <p className="text-sm text-muted">No products recorded.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {shelf.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong>
                {p.brand && <span className="text-muted"> · {p.brand}</span>}
                <span className="text-muted"> · {p.slot === "none" ? "not scheduled" : p.slot.toUpperCase()}</span>
                {p.actives.length > 0 && <span className="text-muted"> · actives: {p.actives.map((a) => a.label).join(", ")}</span>}
              </li>
            ))}
          </ul>
        )}
        {conflicts.length > 0 && (
          <p className="mt-2 text-sm">
            <strong>Flagged combinations:</strong> {conflicts.map((c) => `${c.actives.join(" + ")} (${c.slot.toUpperCase()})`).join("; ")}
          </p>
        )}
      </section>

      {trials.length > 0 && (
        <section>
          <h2 className="mb-2 font-medium">Single-product trials</h2>
          <ul className="space-y-1.5 text-sm">
            {trials.map((t) => (
              <li key={t.id}>
                <strong>{t.product?.name ?? "Product"}</strong> — from {fmtDate(t.startAt)}, day {Math.min(t.verdict.day, 28)}:{" "}
                {VERDICT[t.verdict.status] ?? t.verdict.status}
                {t.verdict.perConcern.length > 0 && (
                  <span className="text-muted">
                    {" "}
                    ({t.verdict.perConcern.map((c) => `${label(c.concern)} ${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(1)}/±${c.threshold.toFixed(1)}`).join(", ")})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="border-t border-line pt-3 text-xs text-muted">
        Scores are photo-based measurements of skin appearance from YouCam AI Skin Analysis, not a clinical assessment. Generated by SkinProof on{" "}
        {fmtDate(new Date())}.
      </p>
    </article>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-semibold">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
