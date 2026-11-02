import { handle, readJson } from "@/lib/http/handle";
import { checkProduct } from "@/lib/services/products";
import { currentUser } from "@/lib/services/users";

// Photo processing, YouCam calls and LLM extraction can take longer than a serverless default.
export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const user = await currentUser();
    const body = await readJson<{ url?: string; text?: string; name?: string }>(req);
    return Response.json(await checkProduct(user.id, { url: body.url || undefined, text: body.text || undefined, name: body.name }));
  });
}
