import { handle } from "@/lib/http/handle";
import { addProduct, listProducts, shelfConflicts } from "@/lib/services/products";
import type { Slot } from "@/lib/domain/ingredients";
import { currentUser } from "@/lib/services/users";

// Photo processing, YouCam calls and LLM extraction can take longer than a serverless default.
export const maxDuration = 60;

const SLOTS: Slot[] = ["am", "pm", "both", "none"];

export async function GET() {
  return handle(async () => {
    const user = await currentUser();
    const [products, conflicts] = await Promise.all([listProducts(user.id), shelfConflicts(user.id)]);
    return Response.json({ products, conflicts });
  });
}

/** multipart (image + optional name/brand/slot) or JSON { url | text, name?, brand?, slot? } */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await currentUser();
    const isForm = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
    let input: { photo?: Buffer; url?: string; text?: string; name?: string; brand?: string; slot?: Slot };
    if (isForm) {
      const form = await req.formData();
      const file = form.get("image");
      input = {
        photo: file instanceof File ? Buffer.from(await file.arrayBuffer()) : undefined,
        name: (form.get("name") as string) || undefined,
        brand: (form.get("brand") as string) || undefined,
        slot: form.get("slot") as Slot,
      };
    } else {
      const body = await req.json().catch(() => ({}));
      input = { url: body.url || undefined, text: body.text || undefined, name: body.name, brand: body.brand, slot: body.slot };
    }
    if (input.slot && !SLOTS.includes(input.slot)) input.slot = "none";
    return Response.json(await addProduct(user.id, input), { status: 201 });
  });
}
