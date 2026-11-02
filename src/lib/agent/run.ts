import type OpenAI from "openai";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { complete, llmProvider } from "@/lib/llm";
import { db, schema } from "@/lib/db/client";
import type { ToolTraceItem } from "@/lib/db/schema";
import { recordUsage } from "@/lib/services/usage";
import { SYSTEM_PROMPT, languageInstruction } from "./prompt";
import { settleRunningScans } from "@/lib/services/scans";
import { TOOL_LABELS, buildTools, type AgentTool } from "./tools";

/** Number of previous turns replayed as context (kept small for free-tier token-per-minute limits). */
const HISTORY_TURNS = 10;
const MAX_ITERATIONS = 8;

export type AgentEvent =
  | { type: "step"; tool: string; label: string }
  | { type: "text"; text: string }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

export async function chatHistory(userId: string) {
  const d = await db();
  return d
    .select({ id: schema.chatMessages.id, role: schema.chatMessages.role, text: schema.chatMessages.text, toolTrace: schema.chatMessages.toolTrace, createdAt: schema.chatMessages.createdAt })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.userId, userId))
    .orderBy(asc(schema.chatMessages.createdAt));
}

/** Zod → JSON Schema for function parameters, minus keywords some providers reject. */
function toFunctionTool(t: AgentTool): OpenAI.Chat.ChatCompletionFunctionTool {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== "object") return node;
    return Object.fromEntries(
      Object.entries(node)
        .filter(([k]) => k !== "$schema" && k !== "additionalProperties")
        .map(([k, v]) => [k, strip(v)]),
    );
  };
  return { type: "function", function: { name: t.name, description: t.description, parameters: strip(z.toJSONSchema(t.inputSchema)) as Record<string, unknown> } };
}

async function runTool(tools: Map<string, AgentTool>, call: OpenAI.Chat.ChatCompletionMessageFunctionToolCall): Promise<string> {
  const t = tools.get(call.function.name);
  if (!t) return JSON.stringify({ error: `Unknown tool ${call.function.name}` });
  let args: unknown;
  try {
    args = call.function.arguments?.trim() ? JSON.parse(call.function.arguments) : {};
  } catch {
    return JSON.stringify({ error: "Arguments were not valid JSON. Call the tool again with a JSON object." });
  }
  const parsed = t.inputSchema.safeParse(args ?? {});
  if (!parsed.success) return JSON.stringify({ error: "Invalid arguments", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
  try {
    return await t.run(parsed.data as never);
  } catch (err) {
    console.error(`[agent] tool ${t.name} failed`, err);
    return JSON.stringify({ error: "The tool failed. Tell the user this part is unavailable right now." });
  }
}

/**
 * One coach turn: a plain tool-calling loop over Chat Completions. Prior turns are replayed as plain text
 * (DECISION D-12) so history is append-only by construction; tool calls are re-run against fresh data each turn.
 */
export async function* runAgent(userId: string, userText: string, lang?: string): AsyncGenerator<AgentEvent> {
  const d = await db();
  await settleRunningScans(userId); // tools must see every finished scan (DECISION D-45)
  const history = (await chatHistory(userId)).slice(-HISTORY_TURNS);
  await d.insert(schema.chatMessages).values({ userId, role: "user", text: userText });

  const tools = new Map(buildTools(userId).map((t) => [t.name, t]));
  const toolDefs = [...tools.values()].map(toFunctionTool);
  const langNote = languageInstruction(lang);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(langNote ? [{ role: "system" as const, content: langNote }] : []),
    ...history.map((m) => ({ role: m.role, content: m.text }) as OpenAI.Chat.ChatCompletionMessageParam),
    { role: "user", content: userText },
  ];

  const trace: ToolTraceItem[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let text = "";
  let ranOut = true;
  let usedModel: string | undefined;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { res, model } = await complete("text", { messages, tools: toolDefs, tool_choice: "auto", temperature: 0.3 });
    usedModel = model;
    inputTokens += res.usage?.prompt_tokens ?? 0;
    outputTokens += res.usage?.completion_tokens ?? 0;
    const msg = res.choices[0]?.message;
    const calls = (msg?.tool_calls ?? []).filter((c): c is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => c.type === "function");
    if (!msg || !calls.length) {
      text = msg?.content?.trim() ?? "";
      ranOut = false;
      break;
    }
    // tool_calls are echoed back verbatim: Gemini attaches thought signatures to them that must round-trip.
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const call of calls) {
      let input: unknown = call.function.arguments;
      try {
        input = JSON.parse(call.function.arguments || "{}");
      } catch {}
      trace.push({ tool: call.function.name, input });
      yield { type: "step", tool: call.function.name, label: TOOL_LABELS[call.function.name] ?? call.function.name };
      messages.push({ role: "tool", tool_call_id: call.id, content: await runTool(tools, call) });
    }
  }

  await recordUsage({ userId, provider: "llm", operation: "agent", units: 0, meta: { provider: llmProvider(), model: usedModel, input_tokens: inputTokens, output_tokens: outputTokens, tools: trace.length } });

  if (!text && ranOut) text = "That took more steps than I allow in one turn — could you narrow the question down?";
  if (!text) text = "Sorry — I couldn't produce an answer. Please try again.";

  const [saved] = await d
    .insert(schema.chatMessages)
    .values({ userId, role: "assistant", text, toolTrace: trace })
    .returning({ id: schema.chatMessages.id });
  yield { type: "text", text };
  yield { type: "done", messageId: saved.id };
}
