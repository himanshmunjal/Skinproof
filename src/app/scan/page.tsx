"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CaptureFlow, type ScanContext } from "@/components/capture-flow";
import { Card, PageHeader } from "@/components/ui";

const MODES: { id: ScanContext; title: string; body: string; shots: 1 | 2 }[] = [
  {
    id: "calibration",
    title: "Calibrate (2 photos)",
    body: "Two photos a minute apart teach SkinProof how much your scores wobble on their own — so later changes are real, not noise.",
    shots: 2,
  },
  { id: "checkin", title: "Weekly check-in", body: "Same light, same spot, same time of day. Feeds your progress and any active trial.", shots: 1 },
  { id: "breakout", title: "Breakout scan", body: "Something flared up? Scan it, then let the coach look for triggers.", shots: 1 },
];

export default function ScanPage() {
  const router = useRouter();
  const [calibrated, setCalibrated] = useState<boolean | null>(null);
  const [mode, setMode] = useState<ScanContext | null>(null);

  useEffect(() => {
    const preset = new URLSearchParams(window.location.search).get("type") as ScanContext | null;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((me) => {
        setCalibrated(Boolean(me.calibrated));
        setMode(preset && MODES.some((m) => m.id === preset) ? preset : me.calibrated ? "checkin" : "calibration");
      })
      .catch(() => setMode(preset ?? "calibration"));
  }, []);

  const current = MODES.find((m) => m.id === mode);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,24rem)]">
      <div>
        <PageHeader
          title="Scan your skin"
          subtitle="Powered by YouCam AI Skin Analysis — 15 concerns, skin age and zone maps from one front-facing photo."
        />
        <div className="space-y-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`w-full rounded-2xl border p-4 text-left transition ${mode === m.id ? "border-accent bg-accent-soft/50" : "border-line bg-surface hover:bg-surface-2"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{m.title}</span>
                {m.id === "calibration" && calibrated === false && <span className="text-xs font-medium text-accent">Start here</span>}
                {m.id === "calibration" && calibrated && <span className="text-xs text-muted">Done ✓ (repeat any time)</span>}
              </div>
              <p className="mt-1 text-sm text-muted">{m.body}</p>
            </button>
          ))}
        </div>
        <Card className="mt-4 bg-surface-2 text-sm text-muted">
          Your photos are stored only in your SkinProof account and sent to YouCam solely for analysis. You can delete everything from the home page.
        </Card>
      </div>
      <div>
        {current && (
          <CaptureFlow
            key={current.id}
            context={current.id}
            shots={current.shots}
            onDone={(ids) => router.push(`/scans/${ids[ids.length - 1]}${current.id === "calibration" ? "?calibrated=1" : ""}`)}
          />
        )}
      </div>
    </div>
  );
}
