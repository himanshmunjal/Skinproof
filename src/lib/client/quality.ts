"use client";

// Capture quality gate (LLD §7, DECISION D-17). Runs on a downscaled canvas — no ML model needed.

export type Quality = { width: number; height: number; brightness: number; blur: number; warnings: string[]; blocking: string | null };

const SAMPLE = 320;
export const MIN_SD = 480;
export const MIN_HD = 1080;

export async function assessPhoto(blob: Blob): Promise<Quality> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const { width, height } = bmp;
  const scale = Math.min(1, SAMPLE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const { data } = ctx.getImageData(0, 0, w, h);

  // Luma (Rec. 601) of the central region, where the face should be.
  const gray = new Float32Array(w * h);
  let sum = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[y * w + x] = l;
      if (x > w * 0.25 && x < w * 0.75 && y > h * 0.2 && y < h * 0.8) {
        sum += l;
        n++;
      }
    }
  }
  const brightness = n ? sum / n : 0;

  // Variance of the 3×3 Laplacian — low variance means few sharp edges (blur).
  let lsum = 0;
  let lsq = 0;
  let ln = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const c = y * w + x;
      const lap = gray[c - w] + gray[c + w] + gray[c - 1] + gray[c + 1] - 4 * gray[c];
      lsum += lap;
      lsq += lap * lap;
      ln++;
    }
  }
  const mean = lsum / ln;
  const blur = lsq / ln - mean * mean;

  const warnings: string[] = [];
  if (brightness < 70) warnings.push("It's quite dark — face a window or turn on a light.");
  if (brightness > 210) warnings.push("It's very bright — avoid direct sun or flash glare.");
  if (blur < 60) warnings.push("The photo looks blurry — hold still and tap to focus.");
  const shortSide = Math.min(width, height);
  if (shortSide < MIN_HD && shortSide >= MIN_SD) warnings.push(`Resolution ${width}×${height} supports standard analysis (HD needs ${MIN_HD}px).`);
  const blocking = shortSide < MIN_SD ? `This photo is too small (${width}×${height}). It needs at least ${MIN_SD}px on its short side.` : null;

  return { width, height, brightness: Math.round(brightness), blur: Math.round(blur), warnings, blocking };
}

/** Mean luma of the centre of a live video frame — drives the light meter while the camera is open. */
export function frameBrightness(video: HTMLVideoElement, canvas: HTMLCanvasElement): number | null {
  if (!video.videoWidth) return null;
  const w = 48;
  const h = Math.round((w * video.videoHeight) / video.videoWidth) || 64;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(Math.round(w * 0.25), Math.round(h * 0.2), Math.round(w * 0.5), Math.round(h * 0.6));
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return Math.round(sum / (data.length / 4));
}

export type LightVerdict = { tone: "good" | "warn"; text: string };

export function lightVerdict(brightness: number, reference: number | null): LightVerdict {
  if (brightness < 70) return { tone: "warn", text: "Too dark — face a window or a lamp" };
  if (brightness > 210) return { tone: "warn", text: "Too bright — avoid direct sun or glare" };
  const drift = lightingDrift(brightness, reference);
  if (drift) return { tone: "warn", text: drift > 0 ? "Brighter than your calibration light" : "Darker than your calibration light" };
  return { tone: "good", text: reference ? "Light matches your calibration" : "Light looks good" };
}

/**
 * Relative brightness difference from the user's calibration photos, or 0 when within ±20%. Same light is the
 * single biggest factor in keeping two scans comparable (DECISION D-38).
 */
export function lightingDrift(brightness: number, reference: number | null): number {
  if (!reference) return 0;
  const rel = (brightness - reference) / reference;
  return Math.abs(rel) > 0.2 ? Math.round(rel * 100) : 0;
}
