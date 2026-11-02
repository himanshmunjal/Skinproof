"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { TimeTravel } from "@/components/time-travel";
import { Badge, Button, ButtonLink, Card, Empty, ErrorNote, PageHeader, PageLoading, ScoreRing } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fmtDate, label, strength } from "@/lib/client/labels";

type PerConcern = { concern: string; baseline: number; current: number; delta: number; threshold: number; label: "improved" | "worse" | "within_noise" };
type Trial = {
  id: string;
  status: "active" | "completed" | "stopped";
  targetConcerns: string[];
  startAt: string;
  endAt: string;
  product: { id: string; name: string; brand: string | null } | null;
  verdict: { status: string; day: number; perConcern: PerConcern[]; recommendation: string };
  review: { rating: number; body: string; consent: boolean } | null;
};

const STATUS: Record<string, { text: string; tone: "good" | "bad" | "warn" | "noise" | "accent" }> = {
  too_early: { text: "Too early to tell", tone: "noise" },
  working: { text: "Working", tone: "good" },
  no_change: { text: "No measurable change", tone: "warn" },
  worsening: { text: "Worsening — stop", tone: "bad" },
  insufficient_data: { text: "Needs a check-in", tone: "accent" },
};

export default function TrialsPage() {
  const [trials, setTrials] = useState<Trial[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ trials: Trial[] }>("/api/trials")
      .then((d) => setTrials(d.trials))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!trials) return <PageLoading />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="In front of the mirror"
        title="28-day trials"
        subtitle="One product, one change, four weeks, weekly scans. The verdict only counts changes bigger than your personal noise band."
        action={<ButtonLink href="/shelf">Start from your shelf</ButtonLink>}
      />
      <TimeTravel onChange={load} />
      {trials.length === 0 && (
        <Empty
          title="No trials yet"
          body="Pick a product on your shelf and tap “Test it for 28 days”. You'll get a measured verdict instead of a feeling."
          action={<ButtonLink href="/shelf">Go to shelf</ButtonLink>}
        />
      )}
      {trials.map((t) => (
        <TrialCard key={t.id} trial={t} onChange={load} />
      ))}
    </div>
  );
}

function TrialCard({ trial: t, onChange }: { trial: Trial; onChange: () => void }) {
  const s = STATUS[t.verdict.status] ?? STATUS.too_early;
  const day = Math.min(t.verdict.day, 28);
  const [reviewing, setReviewing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stop() {
    if (!window.confirm("Stop this trial? The verdict is frozen at today's measurements.")) return;
    try {
      await api(`/api/trials/${t.id}/stop`, { method: "POST" });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card className="animate-rise space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        <ScoreRing value={day} max={28} size={76} label="day" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={s.tone}>{s.text}</Badge>
            {t.status !== "active" && <Badge>{t.status}</Badge>}
          </div>
          <p className="font-display mt-1.5 text-xl font-semibold">{t.product?.name ?? "Product"}</p>
          <p className="text-xs text-muted">
            {fmtDate(t.startAt)} → {fmtDate(t.endAt)} · tracking {t.targetConcerns.map(label).join(", ")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5" aria-label="Weekly check-ins">
        {[1, 2, 3, 4].map((w) => {
          const done = day >= w * 7;
          const current = !done && day >= (w - 1) * 7 && t.status === "active";
          return (
            <div key={w} className={`rounded-lg px-2 py-1.5 text-center text-[11px] ${done ? "bg-accent text-accent-ink" : current ? "bg-accent-soft text-accent ring-1 ring-accent" : "bg-surface-2 text-muted"}`}>
              Week {w}
            </div>
          );
        })}
      </div>

      {t.verdict.perConcern.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {t.verdict.perConcern.map((c) => (
            <div key={c.concern} className="rounded-xl bg-surface-2 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{label(c.concern)}</span>
                <Badge tone={c.label === "improved" ? "good" : c.label === "worse" ? "bad" : "noise"}>
                  {c.label === "within_noise" ? "within noise" : c.label}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted">
                {c.baseline.toFixed(1)} → {c.current.toFixed(1)} ({c.delta >= 0 ? "+" : ""}
                {c.delta.toFixed(1)}, band ±{c.threshold.toFixed(1)})
              </p>
              <p className="mt-1 text-xs">{strength(c.delta, c.threshold).text}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-sm">{t.verdict.recommendation}</p>

      <div className="flex flex-wrap gap-2">
        {t.status === "active" && (
          <>
            <ButtonLink href="/scan?type=checkin">Weekly check-in scan</ButtonLink>
            <Button variant="secondary" onClick={stop}>
              Stop trial
            </Button>
          </>
        )}
        {!t.review && t.verdict.day >= 14 && t.verdict.perConcern.length > 0 && (
          <Button variant="secondary" onClick={() => setReviewing(!reviewing)}>
            Share a Verified Result
          </Button>
        )}
        {t.review && <Badge tone="accent">Verified Result shared ★{t.review.rating}</Badge>}
        {t.verdict.perConcern.length > 0 && (
          <Button variant="secondary" onClick={() => setSharing(true)}>
            <Icon name="share" className="size-4" /> Proof card
          </Button>
        )}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {reviewing && <ReviewForm trialId={t.id} onDone={onChange} />}
      {sharing && <ProofCard trialId={t.id} name={t.product?.name ?? "trial"} onClose={() => setSharing(false)} />}
    </Card>
  );
}

function ReviewForm({ trialId, onDone }: { trialId: string; onDone: () => void }) {
  const [rating, setRating] = useState(4);
  const [body, setBody] = useState("");
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    try {
      await api(`/api/trials/${trialId}/review`, { method: "POST", json: { rating, body, consent } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-3 rounded-xl bg-surface-2 p-3">
      <p className="text-sm">Your review will carry your measured change — not just your opinion. That&apos;s what makes it “verified”.</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} className={`text-xl ${n <= rating ? "text-warn" : "text-line"}`} aria-label={`${n} stars`}>
            ★
          </button>
        ))}
      </div>
      <textarea
        className="min-h-20 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        placeholder="How did it feel to use?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        Include my anonymized result in brand insights (shown only once 3+ people reviewed the product)
      </label>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button onClick={submit}>Publish Verified Result</Button>
    </div>
  );
}

/** Preview + download/share of the server-rendered proof card (api/trials/[id]/card). */
function ProofCard({ trialId, name, onClose }: { trialId: string; name: string; onClose: () => void }) {
  const src = `/api/trials/${trialId}/card`;
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const file = `skinproof-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;

  async function share() {
    try {
      const blob = await (await fetch(src)).blob();
      const f = new File([blob], file, { type: "image/png" });
      if (navigator.canShare?.({ files: [f] })) {
        await navigator.share({ files: [f], title: "My SkinProof result", text: `Measured, not guessed: my 28-day ${name} trial.` });
      } else {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setNote("Copied the image to your clipboard.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote("Sharing isn't available here. Use Download instead.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal aria-label="Proof card">
      <button aria-label="Close" className="absolute inset-0 animate-fade bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl animate-rise space-y-3 rounded-3xl border border-line bg-surface p-4 shadow-lift">
        <div className="flex items-center justify-between">
          <p className="font-display text-lg font-semibold">Your proof card</p>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2">
            <Icon name="close" className="size-4" />
          </button>
        </div>
        <div className="relative aspect-[1200/630] overflow-hidden rounded-2xl border border-line bg-surface-2">
          {!loaded && <div className="skeleton absolute inset-0" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Proof card with your measured trial result" onLoad={() => setLoaded(true)} className="size-full object-contain" />
        </div>
        <p className="text-xs text-muted">No photo, no name — just the measured result. You choose where it goes.</p>
        {note && <p className="text-sm text-accent">{note}</p>}
        <div className="flex flex-wrap gap-2">
          <a href={src} download={file} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink">
            <Icon name="download" className="size-4" /> Download PNG
          </a>
          <Button variant="secondary" onClick={share}>
            <Icon name="share" className="size-4" /> Share
          </Button>
        </div>
      </div>
    </div>
  );
}
