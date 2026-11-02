import { handle } from "@/lib/http/handle";
import { brandInsights } from "@/lib/services/brand";

export async function GET() {
  return handle(async () => Response.json(await brandInsights()));
}
