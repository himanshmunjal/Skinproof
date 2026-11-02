import { handle, readJson } from "@/lib/http/handle";
import { addReview } from "@/lib/services/trials";
import { currentUser } from "@/lib/services/users";

export async function POST(req: Request, ctx: RouteContext<"/api/trials/[id]/review">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson<{ rating?: number; body?: string; consent?: boolean }>(req);
    const review = await addReview((await currentUser()).id, id, {
      rating: Number(body.rating ?? 0),
      body: String(body.body ?? ""),
      consent: body.consent === true,
    });
    return Response.json({ review }, { status: 201 });
  });
}
