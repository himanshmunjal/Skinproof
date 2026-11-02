import { handle } from "@/lib/http/handle";
import { progress } from "@/lib/services/scans";
import { currentUser } from "@/lib/services/users";

export async function GET() {
  return handle(async () => Response.json(await progress((await currentUser()).id)));
}
