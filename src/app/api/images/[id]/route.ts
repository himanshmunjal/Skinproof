import { handle, notFound } from "@/lib/http/handle";
import { loadImage } from "@/lib/services/images";
import { currentUser } from "@/lib/services/users";

// Owner-only: face photos never leave the account that uploaded them.
export async function GET(_req: Request, ctx: RouteContext<"/api/images/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const user = await currentUser();
    const img = await loadImage(user.id, id);
    if (!img) return notFound();
    return new Response(new Uint8Array(img.bytes), {
      headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=31536000, immutable" },
    });
  });
}
