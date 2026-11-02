import { handle } from "@/lib/http/handle";
import { createScan, listScans, publicScan, type ScanContext } from "@/lib/services/scans";
import { ACCEPTED_UPLOAD_TYPES } from "@/lib/services/images";
import { currentUser } from "@/lib/services/users";

// Photo processing, YouCam calls and LLM extraction can take longer than a serverless default.
export const maxDuration = 60;

const CONTEXTS: ScanContext[] = ["routine", "calibration", "checkin", "breakout", "purchase", "validation"];

export async function GET(req: Request) {
  return handle(async () => {
    const user = await currentUser();
    const limit = Math.min(100, Number(new URL(req.url).searchParams.get("limit")) || 30);
    return Response.json({ scans: await listScans(user.id, { limit }) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await currentUser();
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return Response.json({ error: "Attach a photo." }, { status: 400 });
    if (file.type && !ACCEPTED_UPLOAD_TYPES.includes(file.type)) {
      return Response.json({ error: "Use a JPEG, PNG, WebP or HEIC photo." }, { status: 400 });
    }
    const contextRaw = String(form.get("context") ?? "routine") as ScanContext;
    let quality: Record<string, unknown> | undefined;
    try {
      quality = JSON.parse(String(form.get("quality") ?? "null")) ?? undefined;
    } catch {
      quality = undefined;
    }
    const scan = await createScan({
      userId: user.id,
      photo: Buffer.from(await file.arrayBuffer()),
      context: CONTEXTS.includes(contextRaw) ? contextRaw : "routine",
      quality,
    });
    return Response.json({ scan: publicScan(scan) }, { status: 201 });
  });
}
