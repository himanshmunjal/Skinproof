import { handle, notFound, readJson } from "@/lib/http/handle";
import { deleteProduct, shelfConflicts, updateProduct } from "@/lib/services/products";
import type { Slot } from "@/lib/domain/ingredients";
import { currentUser } from "@/lib/services/users";

const SLOTS: Slot[] = ["am", "pm", "both", "none"];

export async function PATCH(req: Request, ctx: RouteContext<"/api/products/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const user = await currentUser();
    const body = await readJson<{ slot?: Slot; onShelf?: boolean }>(req);
    const patch: { slot?: Slot; onShelf?: boolean } = {};
    if (body.slot && SLOTS.includes(body.slot)) patch.slot = body.slot;
    if (typeof body.onShelf === "boolean") patch.onShelf = body.onShelf;
    const product = await updateProduct(user.id, id, patch);
    if (!product) return notFound();
    return Response.json({ product, conflicts: await shelfConflicts(user.id) });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/products/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const user = await currentUser();
    await deleteProduct(user.id, id);
    return Response.json({ deleted: true, conflicts: await shelfConflicts(user.id) });
  });
}
