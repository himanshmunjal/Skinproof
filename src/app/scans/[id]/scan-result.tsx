"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, ButtonLink, Card, ChangeChip, ErrorNote, PageHeader, PageLoading, ScoreRing } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fmtDateTime, label, strength } from "@/lib/client/labels";

type Score = { concern: string; uiScore: number | null; rawScore: number | null; maskImageId: string | null };
type Comparison = { concern: string; before: number; after: number; delta: number; threshold: number; label: string };
type Detail = {
  scan: {
    id: string;
    imageId: string;
    mode: "sd" | "hd";
    status: "pending" | "running" | "success" | "error";
    context: string;
    isCalibration: boolean;
    isMock: boolean;
    errorMessage: string | null;
    overallScore: number | null;
    skinAge: number | null;
    createdAt: string;
  };
  scores: Score[];
  previous: { id: string; createdAt: string } | null;
  comparison: Comparison[];
  calibrated: boolean;
};

export function ScanResult() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [justCalibrated, setJustCalibrated] = useState(false);

  useEffect(() => {
    let stop = false;
    let delay = 2000;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const d = await api<Detail>(`/api/scans/${id}`);
        if (stop) return;
        setJustCalibrated(new URLSearchParams(window.location.search).has("calibrated"));
        setDetail(d);
        if (d.scan.status === "running" || d.scan.status === "pending") {
          delay = Math.min(delay * 1.3, 6000); // gentle backoff — YouCam advises against rapid polling
          timer = setTimeout(tick, delay);
        }
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id]);

  const tracked = useMemo(
    () => (detail?.scores ?? []).filter((s) => s.concern !== "skin_type" && s.uiScore !== null).sort((a, b) => (a.uiScore ?? 0) - (b.uiScore ?? 0)),
    [detail],
  );
  const changes = useMemo(() => new Map((detail?.comparison ?? []).map((c) => [c.concern, c])), [detail]);
  const mask = tracked.find((s) => s.concern === selected)?.maskImageId;

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!detail) return <PageLoading />;
  const { scan } = detail;

  if (scan.status === "running" || scan.status === "pending") {
    return <LoadingCard imageId={scan.imageId} text={`YouCam is analyzing ${scan.mode === "hd" ? "15 HD" : "15"} skin concerns…`} sub="Usually a few seconds. You can leave this page — the result is saved." />;
  }
  if (scan.status === "error") {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <PageHeader title="Let's retake that" />
        <ErrorNote>{scan.errorMessage}</ErrorNote>
        <p className="text-sm text-muted">Failed analyses don&apos;t use any API units.</p>
        <ButtonLink href="/scan">Retake photo</ButtonLink>
      </div>
    );
  }

  const improved = detail.comparison.filter((c) => c.label === "improved");
  const worse = detail.comparison.filter((c) => c.label === "worse");

  return (
    <div className="space-y-6">
      <PageHeader
        title={scan.isCalibration ? "Calibration result" : "Your skin today"}
        subtitle={
          <>
            {fmtDateTime(scan.createdAt)} · YouCam AI Skin Analysis ({scan.mode.toUpperCase()}) {scan.isMock && <Badge className="ml-1">simulated</Badge>}
          </>
        }
        action={<ButtonLink href={`/coach?about=scan`} variant="secondary">Ask the coach</ButtonLink>}
      />

      {justCalibrated && scan.isCalibration && <CalibrationExplainer comparison={detail.comparison} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-3">
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/images/${scan.imageId}`} alt="Scan photo" className="absolute inset-0 size-full object-cover" />
            {mask && (
              // Masks may be white-on-transparent PNGs or white-on-black JPGs; a luminance mask handles both and
              // lets us paint the zones in one clear colour.
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background: "rgb(255 72 120 / 0.9)",
                  maskImage: `url(/api/images/${mask})`,
                  maskMode: "luminance",
                  maskSize: "cover",
                  maskPosition: "center",
                  maskRepeat: "no-repeat",
                }}
              />
            )}
            {selected && <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">{label(selected)} map</span>}
          </div>
          <p className="text-xs text-muted">Tap a concern to see where YouCam found it.</p>
        </div>

        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-6">
            <ScoreRing value={scan.overallScore === null ? null : Math.round(scan.overallScore)} label="overall" />
            {scan.skinAge !== null && (
              <div>
                <div className="font-display text-3xl font-semibold">{scan.skinAge}</div>
                <div className="text-xs uppercase tracking-wide text-muted">skin age</div>
              </div>
            )}
            <div className="min-w-[12rem] flex-1 text-sm">
              {detail.previous ? (
                <p>
                  Since {fmtDateTime(detail.previous.createdAt)}:{" "}
                  <strong className="text-good">{improved.length} improved</strong>, <strong className="text-bad">{worse.length} worse</strong>,{" "}
                  <span className="text-muted">{detail.comparison.length - improved.length - worse.length} within noise</span>.
                </p>
              ) : (
                <p className="text-muted">This is your first scan — it becomes the baseline everything is measured against.</p>
              )}
              {!detail.calibrated && detail.previous && (
                <p className="mt-1 text-xs text-warn">Not calibrated yet — using a conservative ±6 band. Calibrate for tighter, personal bands.</p>
              )}
            </div>
          </Card>

          {detail.previous && <RealChanges comparison={detail.comparison} />}

          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {tracked.map((s) => {
                const ch = changes.get(s.concern);
                return (
                  <li key={s.concern}>
                    <button
                      onClick={() => setSelected(selected === s.concern ? null : s.concern)}
                      className={`grid w-full grid-cols-[7rem_1fr_auto] items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2 ${selected === s.concern ? "bg-accent-soft/40" : ""}`}
                    >
                      <span className="font-medium">{label(s.concern)}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${s.uiScore}%` }} />
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="w-7 text-right tabular-nums">{s.uiScore}</span>
                        {ch && <ChangeChip label={ch.label} delta={ch.delta} threshold={ch.threshold} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/check">Check a product for these concerns</ButtonLink>
            <ButtonLink href={`/compare?b=${scan.id}`} variant="secondary">Compare with first scan</ButtonLink>
            <ButtonLink href="/progress" variant="secondary">See progress</ButtonLink>
            <ButtonLink href="/shelf" variant="secondary">Start a trial</ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The changes that left the noise band, in words — the honest answer to "did anything actually change?". */
function RealChanges({ comparison }: { comparison: Comparison[] }) {
  const real = comparison.filter((c) => c.label !== "within_noise");
  return (
    <Card className="space-y-2">
      <h2 className="text-sm font-medium">What really changed</h2>
      {real.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing moved further than your personal noise band. Small ups and downs between photos are normal — SkinProof won&apos;t call them
          progress.
        </p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {real.map((c) => (
            <li key={c.concern} className="flex gap-2">
              <span className={c.label === "improved" ? "text-good" : "text-bad"}>{c.label === "improved" ? "▲" : "▼"}</span>
              <span>
                <strong>{label(c.concern)}</strong> {c.label === "improved" ? "improved" : "got worse"} by {Math.abs(c.delta).toFixed(1)} points.{" "}
                <span className="text-muted">{strength(c.delta, c.threshold).text}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CalibrationExplainer({ comparison }: { comparison: Comparison[] }) {
  const sorted = [...comparison].sort((a, b) => a.threshold - b.threshold);
  return (
    <Card className="border-accent/40 bg-accent-soft/40">
      <h2 className="font-medium">Calibrated ✓ — these are your personal noise bands</h2>
      <p className="mt-1 text-sm text-muted">
        Both photos are of the same skin, so any difference between them is measurement noise (light, angle, distance). From now on, SkinProof
        only calls a change real when it is bigger than your band.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {sorted.map((c) => (
          <Badge key={c.concern} tone="accent">
            {label(c.concern)} ±{c.threshold.toFixed(1)}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

function LoadingCard({ text, sub, imageId }: { text: string; sub?: string; imageId?: string }) {
  return (
    <Card className="mx-auto flex max-w-sm flex-col items-center gap-4 py-8 text-center">
      {imageId && (
        <div className="relative aspect-[3/4] w-48 overflow-hidden rounded-2xl bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/images/${imageId}`} alt="" className="absolute inset-0 size-full object-cover opacity-80" />
          <div className="absolute inset-x-0 top-0 h-[10%] bg-gradient-to-b from-transparent via-accent/70 to-transparent [animation:scanline_2.2s_ease-in-out_infinite]" />
        </div>
      )}
      <p className="font-medium">{text}</p>
      {sub && <p className="text-sm text-muted">{sub}</p>}
    </Card>
  );
}
