import { config } from "@/lib/config";
import { llmEnabled, llmProvider } from "@/lib/llm";
import { dbDriver } from "@/lib/db/client";
import { handle } from "@/lib/http/handle";
import { calibrationLight, thresholdsFor } from "@/lib/services/noise";
import { listProducts } from "@/lib/services/products";
import { listScans } from "@/lib/services/scans";
import { currentUser, deleteUser } from "@/lib/services/users";
import { youcamUnits } from "@/lib/services/usage";

export async function GET() {
  return handle(async () => {
    const user = await currentUser();
    const [scans, products, noise, units, light] = await Promise.all([
      listScans(user.id, { limit: 50, status: "success" }),
      listProducts(user.id, { onShelfOnly: true }),
      thresholdsFor(user.id),
      youcamUnits(),
      calibrationLight(user.id),
    ]);
    return Response.json({
      user: { id: user.id, isDemo: user.isDemo, displayName: user.displayName, timeShiftDays: user.timeShiftDays },
      calibrated: noise.calibrated,
      calibrationLight: light,
      counts: { scans: scans.length, products: products.length },
      lastScan: scans[0] ? { id: scans[0].id, createdAt: scans[0].createdAt, overallScore: scans[0].overallScore } : null,
      system: {
        youcamMock: config().youcamUseMock,
        ai: llmEnabled(),
        aiProvider: llmProvider() ?? null,
        db: await dbDriver(),
        units,
        timeTravel: config().DEV_TIME_TRAVEL,
        limits: { scansPerDay: config().SCANS_PER_USER_PER_DAY, aiPerDay: config().AI_CALLS_PER_USER_PER_DAY },
      },
    });
  });
}

export async function DELETE() {
  return handle(async () => {
    const user = await currentUser();
    await deleteUser(user.id);
    return Response.json({ deleted: true });
  });
}
