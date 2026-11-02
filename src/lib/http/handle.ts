import { connection } from "next/server";
import { PageFetchError } from "@/lib/fetch-page";
import { ExperimentError } from "@/lib/services/experiments";
import { LlmRateLimited, LlmUnavailable } from "@/lib/llm";
import { ImageRejected } from "@/lib/services/images";
import { ProductInputError } from "@/lib/services/products";
import { TimeTravelError } from "@/lib/services/time-travel";
import { TrialError } from "@/lib/services/trials";
import { QuotaExceeded } from "@/lib/services/usage";

/** Domain errors whose message is safe and useful to show the user as a 400. */
const BAD_REQUEST = [ImageRejected, ProductInputError, PageFetchError, TimeTravelError, TrialError, ExperimentError];

/**
 * Wrap a route handler body: map known domain errors to 4xx/503, log and hide everything else.
 * `connection()` runs first, outside the try, so every API route is request-time only: `next build` never
 * prerenders it (no DB access at build time) and Next's prerender-abort signal is never swallowed as an error.
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  await connection();
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && BAD_REQUEST.some((E) => err instanceof E)) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof QuotaExceeded) return Response.json({ error: err.message, code: "quota" }, { status: 429 });
    if (err instanceof LlmUnavailable) return Response.json({ error: err.message, code: "llm_unavailable" }, { status: 503 });
    if (err instanceof LlmRateLimited) return Response.json({ error: err.message, code: "llm_rate_limited" }, { status: 503 });
    // A malformed id (not a UUID) can't match any row: answer 404 like any other unknown id.
    if (pgCode(err) === "22P02") return notFound();
    console.error("[api] unhandled error", err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

/** Postgres SQLSTATE of a query error (Drizzle wraps the driver error in `cause`). */
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.cause?.code ?? e?.code;
  return typeof code === "string" ? code : undefined;
}
