import { handle } from "@/lib/http/handle";
import { switchToDemoUser } from "@/lib/services/users";

export async function POST() {
  return handle(async () => {
    const demo = await switchToDemoUser();
    if (!demo) return Response.json({ error: "Demo data isn't seeded yet. Run `npm run db:seed`." }, { status: 404 });
    return Response.json({ user: { id: demo.id, isDemo: true } });
  });
}
