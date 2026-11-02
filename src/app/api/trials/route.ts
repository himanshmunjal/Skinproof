import { handle, readJson } from "@/lib/http/handle";
import { listTrials, startTrial } from "@/lib/services/trials";
import { currentUser } from "@/lib/services/users";

export async function GET() {
  return handle(async () => Response.json({ trials: await listTrials((await currentUser()).id) }));
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await currentUser();
    const body = await readJson<{ productId?: string; targetConcerns?: string[] }>(req);
    const trial = await startTrial(user.id, String(body.productId ?? ""), Array.isArray(body.targetConcerns) ? body.targetConcerns : []);
    return Response.json({ trial }, { status: 201 });
  });
}
