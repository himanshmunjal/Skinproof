import { handle } from "@/lib/http/handle";
import { stopTrial } from "@/lib/services/trials";
import { currentUser } from "@/lib/services/users";

export async function POST(_req: Request, ctx: RouteContext<"/api/trials/[id]/stop">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return Response.json({ trial: await stopTrial((await currentUser()).id, id) });
  });
}
