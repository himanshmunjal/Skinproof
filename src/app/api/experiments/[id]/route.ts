import { handle, notFound, readJson } from "@/lib/http/handle";
import { attachAfterScan, deleteExperiment } from "@/lib/services/experiments";
import { currentUser } from "@/lib/services/users";

/** { afterScanId } — the second photo of the test. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/experiments/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { afterScanId } = await readJson<{ afterScanId?: string }>(req);
    const experiment = await attachAfterScan((await currentUser()).id, id, String(afterScanId ?? ""));
    return experiment ? Response.json({ experiment }) : notFound();
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/experiments/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    await deleteExperiment((await currentUser()).id, id);
    return Response.json({ deleted: true });
  });
}
