"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { assessPhoto, frameBrightness, lightVerdict, lightingDrift, type LightVerdict, type Quality } from "@/lib/client/quality";
import { Badge, Button, Card, ErrorNote, Spinner } from "./ui";

export type ScanContext = "routine" | "calibration" | "checkin" | "breakout" | "purchase" | "validation";

type Shot = { blob: Blob; url: string; quality: Quality };
type Stage = "idle" | "camera" | "review" | "uploading";

const TIPS = ["Hair off your forehead", "Even light from the front", "No glasses, mouth closed", "Face fills the oval"];

/**
 * Capture → quality gate → upload. `shots = 2` runs the calibration pair: same pose, re-framed between shots,
 * so the difference between the two results measures pure measurement noise.
 */
export function CaptureFlow({ context, shots, onDone }: { context: ScanContext; shots: 1 | 2; onDone: (scanIds: string[]) => void }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [shot, setShot] = useState<Shot | null>(null);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [referenceLight, setReferenceLight] = useState<number | null>(null);
  const [live, setLive] = useState<LightVerdict | null>(null);

  // Calibration photos set the lighting every later scan should match. The calibration pair itself is the reference.
  useEffect(() => {
    if (context === "calibration") return;
    api<{ calibrationLight: number | null }>("/api/me")
      .then((d) => setReferenceLight(d.calibrationLight))
      .catch(() => {});
  }, [context]);

  // Live light meter: sample the video centre twice a second while the camera is open.
  useEffect(() => {
    if (stage !== "camera") return;
    const canvas = document.createElement("canvas");
    const id = setInterval(() => {
      const b = videoRef.current && frameBrightness(videoRef.current, canvas);
      if (b !== null && b !== undefined) setLive(lightVerdict(b, referenceLight));
    }, 500);
    return () => {
      clearInterval(id);
      setLive(null);
    };
  }, [stage, referenceLight]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 2560 }, height: { ideal: 1440 } },
        audio: false,
      });
      streamRef.current = stream;
      setStage("camera");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setError("Couldn't open the camera. Allow camera access, or upload a photo instead.");
    }
  }

  async function accept(blob: Blob) {
    const quality = await assessPhoto(blob);
    const drift = lightingDrift(quality.brightness, referenceLight);
    if (drift) {
      quality.warnings.push(
        `Lighting is ${Math.abs(drift)}% ${drift > 0 ? "brighter" : "darker"} than your calibration photos. Same spot, same light keeps results comparable.`,
      );
    }
    setShot((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { blob, url: URL.createObjectURL(blob), quality };
    });
    setStage("review");
  }

  async function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    // Crop the centre to a 3:4 portrait so the face fills more of the width (YouCam needs > 60%).
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = Math.min(vw, Math.round((vh * 3) / 4));
    const ch = Math.min(vh, Math.round((cw * 4) / 3));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    canvas.getContext("2d")!.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, cw, ch);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    stopCamera();
    if (blob) await accept(blob);
  }

  async function upload() {
    if (!shot || shot.quality.blocking) return;
    setStage("uploading");
    setError(null);
    try {
      const form = new FormData();
      form.append("image", shot.blob, "scan.jpg");
      form.append("context", context);
      form.append("quality", JSON.stringify(shot.quality));
      const { scan } = await api<{ scan: { id: string; status: string; errorMessage: string | null } }>("/api/scans", { method: "POST", body: form });
      if (scan.status === "error") throw new Error(scan.errorMessage ?? "The analysis could not start.");
      const ids = [...uploaded, scan.id];
      setUploaded(ids);
      URL.revokeObjectURL(shot.url);
      setShot(null);
      if (ids.length >= shots) onDone(ids);
      else setStage("idle");
    } catch (e) {
      setError((e as Error).message);
      setStage("review");
    }
  }

  const step = uploaded.length + 1;

  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      {shots === 2 && (
        <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2.5 text-sm">
          <span className="font-medium">
            Calibration photo {Math.min(step, 2)} of 2
          </span>
          <span className="text-muted">{step === 1 ? "Same pose for both" : "Step back, re-frame, same pose"}</span>
        </div>
      )}

      <div className="relative mx-auto aspect-[3/4] w-full max-w-sm bg-black">
        {stage === "camera" && (
          <>
            <video ref={videoRef} playsInline muted className="absolute inset-0 size-full -scale-x-100 object-cover" />
            <FaceOval />
            {live && (
              <span
                aria-live="polite"
                className={`absolute inset-x-0 top-3 mx-auto w-fit rounded-full px-3 py-1 text-xs font-medium ${live.tone === "good" ? "bg-good text-white" : "bg-warn text-white"}`}
              >
                {live.tone === "good" ? "☀ " : "⚠ "}
                {live.text}
              </span>
            )}
          </>
        )}
        {(stage === "review" || stage === "uploading") && shot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot.url} alt="Your photo" className="absolute inset-0 size-full object-cover" />
        )}
        {stage === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
            <FaceOval dim />
            <p className="relative z-10 max-w-[16rem] text-sm text-white/85">
              {step === 2 ? "Great. Now take the second photo — step back, re-frame and hold the same pose." : "Front-facing, bare skin, even light."}
            </p>
            <ul className="relative z-10 flex flex-wrap justify-center gap-1.5">
              {TIPS.map((t) => (
                <li key={t} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px]">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}
        {stage === "uploading" && (
          <div className="absolute inset-0 grid place-items-center bg-black/50 text-white">
            <span className="flex items-center gap-2 text-sm">
              <Spinner /> Uploading securely…
            </span>
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        {stage === "idle" && (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={startCamera}>Open camera</Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              Upload photo
            </Button>
          </div>
        )}
        {stage === "camera" && (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={capture}>Take photo</Button>
            <Button
              variant="secondary"
              onClick={() => {
                stopCamera();
                setStage("idle");
              }}
            >
              Cancel
            </Button>
          </div>
        )}
        {stage === "review" && shot && (
          <>
            <QualityReport q={shot.quality} />
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={upload} disabled={!!shot.quality.blocking}>
                {shots === 2 && step === 1 ? "Use photo 1" : "Analyze my skin"}
              </Button>
              <Button variant="secondary" onClick={() => setStage("idle")}>
                Retake
              </Button>
            </div>
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void accept(f);
          }}
        />
      </div>
    </Card>
  );
}

function QualityReport({ q }: { q: Quality }) {
  if (q.blocking) return <ErrorNote>{q.blocking}</ErrorNote>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={q.brightness >= 70 && q.brightness <= 210 ? "good" : "warn"}>Light {q.brightness}</Badge>
        <Badge tone={q.blur >= 60 ? "good" : "warn"}>Sharpness {q.blur}</Badge>
        <Badge tone={Math.min(q.width, q.height) >= 1080 ? "good" : "noise"}>
          {q.width}×{q.height} · {Math.min(q.width, q.height) >= 1080 ? "HD-ready" : "SD"}
        </Badge>
      </div>
      {q.warnings.length > 0 && (
        <ul className="space-y-1 text-sm text-warn">
          {q.warnings.map((w) => (
            <li key={w}>• {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FaceOval({ dim = false }: { dim?: boolean }) {
  // Oval at ~70% of the frame width: YouCam needs the face wider than 60% of the photo.
  return (
    <svg viewBox="0 0 300 400" className="pointer-events-none absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <mask id="oval-hole">
          <rect width="300" height="400" fill="white" />
          <ellipse cx="150" cy="190" rx="105" ry="140" fill="black" />
        </mask>
      </defs>
      <rect width="300" height="400" fill="black" opacity={dim ? 0.55 : 0.35} mask="url(#oval-hole)" />
      <ellipse cx="150" cy="190" rx="105" ry="140" fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="2" strokeDasharray="6 6" />
    </svg>
  );
}
