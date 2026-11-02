import crypto from "node:crypto";
import sharp from "sharp";
import { concernFromType, type Concern } from "./concerns";
import type { SkinTaskResult, YouCamClient, YouCamOutputItem } from "./types";

/**
 * Zero-unit stand-in for YouCam with the exact same output shape.
 * - Scores come from a fixed "persona" plus small measurement noise seeded by (image hash, task time),
 *   so a calibration pair behaves like the real thing (close but not identical).
 * - Tasks report `running` for ~3s, then `success`.
 * - Masks are generated locally as translucent PNGs over plausible facial zones.
 */
export class MockYouCamClient implements YouCamClient {
  readonly isMock = true;
  static readonly LATENCY_MS = 3000;

  async uploadImage(bytes: Buffer): Promise<string> {
    const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    const meta = await sharp(bytes).metadata();
    return `mockfile_${hash}_${meta.width ?? 1080}x${meta.height ?? 1440}`;
  }

  async createSkinTask(fileId: string, dstActions: string[]): Promise<string> {
    const payload = Buffer.from(JSON.stringify({ fileId, dstActions, t: Date.now() })).toString("base64url");
    return `mock_${payload}`;
  }

  async getSkinTask(taskId: string): Promise<SkinTaskResult> {
    const { fileId, dstActions, t } = JSON.parse(Buffer.from(taskId.slice(5), "base64url").toString()) as {
      fileId: string;
      dstActions: string[];
      t: number;
    };
    if (Date.now() - t < MockYouCamClient.LATENCY_MS) return { status: "running", raw: { mock: true } };

    const [, hash, dims] = fileId.split("_");
    const rand = seeded(`${hash}:${t}`);
    const output: YouCamOutputItem[] = [];
    for (const action of dstActions) {
      const concern = concernFromType(action);
      if (!concern) continue;
      if (concern === "skin_type") {
        output.push({ type: action, ui_score: 0, raw_score: 0, mask_urls: [], skin_type: "combination" });
        continue;
      }
      const raw = clamp(PERSONA[concern] + gaussian(rand) * 1.6, 1, 100);
      output.push({
        type: action,
        raw_score: Math.round(raw * 100) / 100,
        ui_score: Math.round(clamp(raw * 0.75 + 22, 1, 100)),
        mask_urls: [`mock://mask/${concern}/${dims}/${hash}`],
      });
    }
    return { status: "success", output, raw: { mock: true, data: { task_status: "success", results: { output } } } };
  }

  async download(url: string): Promise<{ bytes: Buffer; mime: string }> {
    const [, , , concern, dims, seed] = url.split("/");
    const [w, h] = dims.split("x").map(Number);
    return { bytes: await renderMask(concern as Concern, w || 1080, h || 1440, seed), mime: "image/png" };
  }
}

// Higher raw score = healthier-looking skin (YouCam convention).
const PERSONA: Record<Exclude<Concern, "skin_type">, number> = {
  wrinkle: 74,
  pore: 58,
  texture: 63,
  acne: 61,
  redness: 55,
  oiliness: 52,
  age_spot: 70,
  radiance: 60,
  moisture: 57,
  dark_circle: 54,
  eye_bag: 66,
  firmness: 72,
  droopy_upper_eyelid: 80,
  droopy_lower_eyelid: 78,
  tear_trough: 69,
};

// Face-relative zones (x, y as fractions of width/height) where each concern's dots are drawn.
const ZONES: Record<string, [number, number][]> = {
  wrinkle: [[0.5, 0.26], [0.33, 0.42], [0.67, 0.42]],
  pore: [[0.5, 0.5], [0.38, 0.54], [0.62, 0.54]],
  texture: [[0.36, 0.56], [0.64, 0.56]],
  acne: [[0.35, 0.58], [0.66, 0.6], [0.5, 0.27]],
  redness: [[0.36, 0.55], [0.64, 0.55], [0.5, 0.5]],
  oiliness: [[0.5, 0.27], [0.5, 0.48]],
  age_spot: [[0.34, 0.5], [0.66, 0.5]],
  radiance: [[0.5, 0.4]],
  moisture: [[0.36, 0.58], [0.64, 0.58]],
  dark_circle: [[0.41, 0.45], [0.59, 0.45]],
  eye_bag: [[0.41, 0.46], [0.59, 0.46]],
  firmness: [[0.38, 0.66], [0.62, 0.66]],
  droopy_upper_eyelid: [[0.41, 0.4], [0.59, 0.4]],
  droopy_lower_eyelid: [[0.41, 0.44], [0.59, 0.44]],
  tear_trough: [[0.43, 0.47], [0.57, 0.47]],
};

async function renderMask(concern: Concern, w: number, h: number, seed: string): Promise<Buffer> {
  const rand = seeded(`${seed}:${concern}`);
  const zones = ZONES[concern] ?? [[0.5, 0.5]];
  const dots: string[] = [];
  for (const [zx, zy] of zones) {
    for (let i = 0; i < 26; i++) {
      const cx = (zx + gaussian(rand) * 0.035) * w;
      const cy = (zy + gaussian(rand) * 0.025) * h;
      const r = (0.004 + rand() * 0.008) * w;
      dots.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="white" fill-opacity="${(0.5 + rand() * 0.45).toFixed(2)}"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${dots.join("")}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function seeded(key: string): () => number {
  // mulberry32 seeded from a sha256 of the key — deterministic per key.
  let a = crypto.createHash("sha256").update(key).digest().readUInt32LE(0);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
