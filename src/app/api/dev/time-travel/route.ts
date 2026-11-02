import { handle, readJson } from "@/lib/http/handle";
import { skipAhead } from "@/lib/services/time-travel";
import { currentUser } from "@/lib/services/users";

/** Dev-only: shift the current user's records N days into the past (DECISION D-34). */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await currentUser();
    const { days } = await readJson<{ days?: number }>(req);
    return Response.json(await skipAhead(user.id, Number(days)));
  });
}
