import { handle, notFound } from "@/lib/http/handle";
import { getTrial } from "@/lib/services/trials";
import { currentUser } from "@/lib/services/users";

export async function GET(_req: Request, ctx: RouteContext<"/api/trials/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const trial = await getTrial((await currentUser()).id, id);
    return trial ? Response.json({ trial }) : notFound();
  });
}
