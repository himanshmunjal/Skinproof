import { handle } from "@/lib/http/handle";
import { startFresh } from "@/lib/services/users";

export async function POST() {
  return handle(async () => {
    const user = await startFresh();
    return Response.json({ user: { id: user.id, isDemo: false } });
  });
}
