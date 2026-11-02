import { handle, readJson } from "@/lib/http/handle";
import { createExperiment, validationReport } from "@/lib/services/experiments";
import { currentUser } from "@/lib/services/users";

export const maxDuration = 60;

export async function GET() {
  return handle(async () => Response.json(await validationReport((await currentUser()).id)));
}

/** { kind, beforeScanId } — starts a validation test from its first (validation-context) scan. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await currentUser();
    const { kind, beforeScanId } = await readJson<{ kind?: string; beforeScanId?: string }>(req);
    const experiment = await createExperiment(user.id, String(kind ?? ""), String(beforeScanId ?? ""));
    return Response.json({ experiment }, { status: 201 });
  });
}
