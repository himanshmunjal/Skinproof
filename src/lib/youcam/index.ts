import { config } from "@/lib/config";
import { RealYouCamClient } from "./client";
import { MockYouCamClient } from "./mock";
import type { YouCamClient } from "./types";

let real: RealYouCamClient | undefined;
const mock = new MockYouCamClient();

/** The client for new tasks (mock when YOUCAM_MOCK=true or no key). */
export function youcam(): YouCamClient {
  const cfg = config();
  if (cfg.youcamUseMock) return mock;
  real ??= new RealYouCamClient(cfg.YOUCAM_API_KEY!, cfg.YOUCAM_BASE_URL);
  return real;
}

/** The client that owns an existing task — a scan started in mock mode keeps polling the mock. */
export function youcamFor(isMock: boolean): YouCamClient {
  return isMock ? mock : youcam();
}

export * from "./types";
export * from "./concerns";
export { parseSkinOutput } from "./parse";
