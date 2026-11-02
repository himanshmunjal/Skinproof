"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CaptureFlow } from "@/components/capture-flow";
import { Badge, Button, ButtonLink, Card, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fmtDateTime, label } from "@/lib/client/labels";
import { EXPERIMENTS, type ExperimentKind, type ExperimentResult, type ValidationSummary } from "@/lib/domain/validation";

type Experiment = {
  id: string;
  kind: ExperimentKind;
  createdAt: string;
  status: "needs_after" | "analyzing" | "failed" | "done";
  isMock: boolean;
  result: ExperimentResult | null;
};
type Report = {
  calibrated: boolean;
  bands: { concern: string; threshold: number; pairs: number }[];
  experiments: Experiment[];
  summary: ValidationSummary;
  includesSimulated: boolean;
};

const KINDS = Object.keys(EXPERIMENTS) as ExperimentKind[];

export default function EvidencePage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Report>("/api/experiments")
      .then(setReport)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  // Poll while any test is still being analyzed by YouCam.
  const analyzing = report?.experiments.some((e) => e.status === "analyzing");
  useEffect(() => {
    if (!analyzing) return;
    const id = setTimeout(load, 3000);
    return () => clearTimeout(id);
  }, [analyzing, report, load]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Method & evidence"
        subtitle="How SkinProof decides that a change is real — and tests you can run to check it yourself instead of taking our word for it."
      />

      <Method />

      {error && <ErrorNote>{error}</ErrorNote>}
      {!report && !error && (
        <div className="flex justify-center py-10">
          <Spinner className="size-6 text-accent" />
        </div>
      )}
      {report && (
        <>
          <Bands report={report} />
          <Validation report={report} onChange={load} />
        </>
      )}

      <Limitations />
    </div>
  );
}

function Method() {
  const steps = [
    {
      n: "1",
      title: "Measure the wobble",
      body: "Two photos of the same face a minute apart never score the same. The calibration pair measures how much each of your 15 concerns moves on its own.",
    },
    {
      n: "2",
      title: "Draw a 95% band",
      body: "From the paired differences d: band = 1.96 · √(Σd² / n). A change between two scans that is inside the band is indistinguishable from photo-to-photo noise.",
    },
    {
      n: "3",
      title: "Only report what leaves it",
      body: "Every change is expressed in bands: 0.8× is noise, 1.5× is likely real, 2×+ is clear. Trials need 14+ days and average the two latest check-ins.",
    },
  ];
  return (
    <section className="grid gap-3 md:grid-cols-3">
      {steps.map((s) => (
        <Card key={s.n}>
          <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{s.n}</span>
          <p className="mt-3 font-medium">{s.title}</p>
          <p className="mt-1 text-sm text-muted">{s.body}</p>
        </Card>
      ))}
    </section>
  );
}

function Bands({ report }: { report: Report }) {
  const max = Math.max(...report.bands.map((b) => b.threshold), 1);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold">Your noise bands</h2>
          <p className="text-sm text-muted">
            {report.calibrated
              ? "Smaller is better: a tighter band can detect subtler change. Each extra calibration pair makes the estimate more reliable."
              : "Not calibrated yet — every concern uses a conservative ±6 default."}
          </p>
        </div>
        <ButtonLink href="/scan?type=calibration" variant="secondary">
          {report.calibrated ? "Add a calibration pair" : "Calibrate now"}
        </ButtonLink>
      </div>
      <Card className="p-0 sm:p-0">
        <ul className="divide-y divide-line">
          {report.bands.map((b) => (
            <li key={b.concern} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 px-4 py-2 text-sm">
              <span className="font-medium">{label(b.concern)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-noise" style={{ width: `${(b.threshold / max) * 100}%` }} />
              </span>
              <span className="w-28 text-right text-xs tabular-nums text-muted">
                ±{b.threshold.toFixed(1)} · {b.pairs ? `${b.pairs} pair${b.pairs > 1 ? "s" : ""}` : "default"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function Validation({ report, onChange }: { report: Report; onChange: () => void }) {
  const { summary } = report;
  const pending = report.experiments.find((e) => e.status === "needs_after");
  const [kind, setKind] = useState<ExperimentKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startTest(k: ExperimentKind, scanId: string) {
    try {
      await api("/api/experiments", { method: "POST", json: { kind: k, beforeScanId: scanId } });
      setKind(null);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function finishTest(id: string, scanId: string) {
    try {
      await api(`/api/experiments/${id}`, { method: "PATCH", json: { afterScanId: scanId } });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove(id: string) {
    await api(`/api/experiments/${id}`, { method: "DELETE" });
    onChange();
  }

  const nullRate = summary.nullReadings ? Math.round((summary.nullInBand / summary.nullReadings) * 100) : null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-semibold">Validate it yourself</h2>
        <p className="text-sm text-muted">
          Each test is two photos with a known right answer. Test scans are kept out of your progress, trials and coach — a concealer photo will never
          count as progress. Each test uses 2 scans.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Nothing changed → stayed in band</p>
          <p className="font-display mt-1 text-3xl font-semibold">{nullRate === null ? "–" : `${nullRate}%`}</p>
          <p className="text-xs text-muted">
            {summary.nullReadings ? `${summary.nullInBand} of ${summary.nullReadings} readings` : "No test yet"} · a calibrated 95% band should give ≈95%
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Real change → detected</p>
          <p className="font-display mt-1 text-3xl font-semibold">
            {summary.positiveTests ? `${summary.positiveDetected}/${summary.positiveTests}` : "–"}
          </p>
          <p className="text-xs text-muted">Concealer and flush tests, where something really did change</p>
        </Card>
      </div>
      {report.includesSimulated && (
        <p className="text-xs text-warn">Includes tests run with simulated (mock) scans — rerun them live for real evidence.</p>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}

      {pending ? (
        <Card className="space-y-3 border-accent/40">
          <div>
            <Badge tone="accent">Step 2 of 2 · {EXPERIMENTS[pending.kind].title}</Badge>
            <p className="mt-2 font-medium">Now: {EXPERIMENTS[pending.kind].between}</p>
            <p className="text-sm text-muted">Then take the second photo from the same spot. {EXPERIMENTS[pending.kind].expectation}</p>
          </div>
          <div className="max-w-sm">
            <CaptureFlow key={pending.id} context="validation" shots={1} onDone={(ids) => finishTest(pending.id, ids[0])} />
          </div>
          <Button variant="ghost" onClick={() => remove(pending.id)}>
            Cancel this test
          </Button>
        </Card>
      ) : kind ? (
        <Card className="space-y-3 border-accent/40">
          <div>
            <Badge tone="accent">Step 1 of 2 · {EXPERIMENTS[kind].title}</Badge>
            <p className="mt-2 text-sm text-muted">Take the &ldquo;before&rdquo; photo now: bare skin, your usual scan spot and light.</p>
          </div>
          <div className="max-w-sm">
            <CaptureFlow key={kind} context="validation" shots={1} onDone={(ids) => startTest(kind, ids[0])} />
          </div>
          <Button variant="ghost" onClick={() => setKind(null)}>
            Back
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {KINDS.map((k) => (
            <Card key={k} className="flex flex-col">
              <p className="font-medium">{EXPERIMENTS[k].title}</p>
              <p className="mt-1 flex-1 text-sm text-muted">{EXPERIMENTS[k].expectation}</p>
              <Button variant="secondary" className="mt-3" onClick={() => setKind(k)}>
                Run this test
              </Button>
            </Card>
          ))}
        </div>
      )}

      {report.experiments.length > 0 && (
        <Card className="p-0 sm:p-0">
          <h3 className="border-b border-line px-4 py-3 text-sm font-medium">Test log</h3>
          <ul className="divide-y divide-line">
            {report.experiments.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {EXPERIMENTS[e.kind].title} {e.isMock && <Badge className="ml-1">simulated</Badge>}
                  </p>
                  <p className="text-xs text-muted">{fmtDateTime(e.createdAt)}</p>
                  {e.result && (
                    <p className="mt-1">
                      {e.result.summary}
                      {e.result.detected.length > 0 && <span className="text-muted"> ({e.result.detected.map(label).join(", ")})</span>}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {e.status === "done" && e.result && <Badge tone={e.result.passed ? "good" : "bad"}>{e.result.passed ? "pass" : "fail"}</Badge>}
                  {e.status === "analyzing" && (
                    <Badge>
                      <Spinner className="size-3" /> analyzing
                    </Badge>
                  )}
                  {e.status === "needs_after" && <Badge tone="accent">needs 2nd photo</Badge>}
                  {e.status === "failed" && <Badge tone="bad">scan failed</Badge>}
                  <button className="text-xs text-muted hover:text-bad" onClick={() => remove(e.id)} aria-label="Delete test">
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function Limitations() {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold">Limits we&apos;re honest about</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="text-sm text-muted">
          <p className="mb-1 font-medium text-ink">Fairness across skin tones</p>
          Noise is measured per person, so a band that is wider for one face is never applied to another. We haven&apos;t yet measured whether
          YouCam&apos;s scores are equally stable across skin tones — the no-change test above is how anyone can check it for their own skin.
        </Card>
        <Card className="text-sm text-muted">
          <p className="mb-1 font-medium text-ink">Light is the biggest source of noise</p>
          The camera warns when lighting differs from your calibration photos by more than 20%. Same spot, same time of day, no flash.
        </Card>
        <Card className="text-sm text-muted">
          <p className="mb-1 font-medium text-ink">One calibration pair is a rough estimate</p>
          A band from a single pair can be too tight or too wide. The no-change test catches a band that is too tight; adding pairs fixes it.
        </Card>
        <Card className="text-sm text-muted">
          <p className="mb-1 font-medium text-ink">Not a medical device</p>
          Scores describe how skin looks in a photo, not its health. See our{" "}
          <Link href="/privacy" className="font-medium text-accent">
            privacy &amp; safety notes
          </Link>
          .
        </Card>
      </div>
    </section>
  );
}
