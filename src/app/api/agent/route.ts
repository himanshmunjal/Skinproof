import { chatHistory, runAgent } from "@/lib/agent/run";
import { LlmRateLimited, llm } from "@/lib/llm";
import { handle, readJson } from "@/lib/http/handle";
import { assertDailyQuota } from "@/lib/services/usage";
import { currentUser } from "@/lib/services/users";

// Agent turns can take a while (several tool calls); allow up to 5 minutes where the platform supports it.
export const maxDuration = 300;

export async function GET() {
  return handle(async () => Response.json({ messages: await chatHistory((await currentUser()).id) }));
}

/** Server-Sent Events: `step` per tool call, then `text`, then `done` (or `error`). */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await currentUser();
    llm(); // throws LlmUnavailable (→ 503) before we open the stream
    await assertDailyQuota(user.id, "llm");
    const { message, lang } = await readJson<{ message?: string; lang?: string }>(req);
    const text = String(message ?? "").trim().slice(0, 4000);
    if (!text) return Response.json({ error: "Say something first." }, { status: 400 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        try {
          for await (const ev of runAgent(user.id, text, typeof lang === "string" ? lang : undefined)) send(ev.type, ev);
        } catch (err) {
          console.error("[agent] turn failed", err);
          send("error", { type: "error", message: err instanceof LlmRateLimited ? err.message : "The coach hit an error. Please try again." });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
    });
  });
}
