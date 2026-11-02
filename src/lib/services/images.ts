import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { IMAGE_RULES } from "@/lib/youcam/concerns";

export const ACCEPTED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export class ImageRejected extends Error {}

export type NormalizedImage = { bytes: Buffer; mime: "image/jpeg"; width: number; height: number };

/** EXIF-rotate, cap the long side at 2560px (YouCam's limit) and re-encode as JPEG. */
export async function normalizePhoto(input: Buffer): Promise<NormalizedImage> {
  if (input.length > IMAGE_RULES.maxBytes * 2) throw new ImageRejected("Photo is larger than 20MB.");
  let pipeline = sharp(input, { failOn: "error" }).rotate();
  const meta = await sharp(input).metadata();
  const orientedSwap = (meta.orientation ?? 1) >= 5;
  const w = (orientedSwap ? meta.height : meta.width) ?? 0;
  const h = (orientedSwap ? meta.width : meta.height) ?? 0;
  if (!w || !h) throw new ImageRejected("Couldn't read that image.");
  if (Math.max(w, h) > IMAGE_RULES.maxLongSide) {
    pipeline = pipeline.resize({ width: w >= h ? IMAGE_RULES.maxLongSide : undefined, height: h > w ? IMAGE_RULES.maxLongSide : undefined });
  }
  const { data, info } = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  if (data.length > IMAGE_RULES.maxBytes) throw new ImageRejected("Photo is still over 10MB after compression.");
  return { bytes: data, mime: "image/jpeg", width: info.width, height: info.height };
}

/** Product label photos only need to be legible for the vision model — keep them small. */
export async function normalizeLabelPhoto(input: Buffer): Promise<NormalizedImage> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, mime: "image/jpeg", width: info.width, height: info.height };
}

export async function storeImage(
  userId: string,
  kind: "scan" | "mask" | "product",
  img: { bytes: Buffer; mime: string; width?: number; height?: number },
): Promise<string> {
  const d = await db();
  const [row] = await d
    .insert(schema.images)
    .values({ userId, kind, mime: img.mime, width: img.width, height: img.height, bytes: img.bytes })
    .returning({ id: schema.images.id });
  return row.id;
}

export async function loadImage(userId: string, imageId: string) {
  const d = await db();
  const [row] = await d
    .select()
    .from(schema.images)
    .where(and(eq(schema.images.id, imageId), eq(schema.images.userId, userId)));
  return row ?? null;
}
