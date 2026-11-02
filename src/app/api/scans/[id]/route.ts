import { handle, notFound } from "@/lib/http/handle";
import { scanDetail } from "@/lib/services/scans";
import { currentUser } from "@/lib/services/users";

// Photo processing, YouCam calls and LLM extraction can take longer than a serverless default.
export const maxDuration = 60;

export async function GET(_req: Request, ctx: RouteContext<"/api/scans/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const user = await currentUser();
    const detail = await scanDetail(user.id, id);
    return detail ? Response.json(detail) : notFound();
  });
}
