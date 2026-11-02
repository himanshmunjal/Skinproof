"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { REPLY_LANGUAGES } from "@/lib/agent/prompt";

const LANG_KEY = "skinproof:lang";

type Msg = { id?: string; role: "user" | "assistant"; text: string; steps?: string[] };

const SUGGESTIONS = [
  "Is my skin actually improving?",
  "I just broke out on my chin — what's the likely cause and what should I do tonight?",
  "Is my current routine safe to use together?",
  "I want to start a retinol. How should I test it?",
];

export default function CoachPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);
  const [lang, setLang] = useState("en");

  function pickLang(l: string) {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {}
  }

  useEffect(() => {
    fetch("/api/agent", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setLang(readLang()); // after mount, so the server-rendered "en" never mismatches on hydration
        setMessages((d.messages ?? []).map((m: { id: string; role: "user" | "assistant"; text: string; toolTrace?: { tool: string }[] }) => ({ ...m, steps: m.toolTrace?.map((t) => t.tool) })));
        const q = new URLSearchParams(window.location.search).get("q");
        if (q && !autoSent.current) {
          autoSent.current = true;
          void send(q);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Block body on purpose: newer browsers return a Promise from scrollIntoView, and React would treat any
    // returned value as a cleanup function.
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, steps]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy) return;
    setInput("");
    setError(null);
    setBusy(true);
    setSteps([]);
    setMessages((m) => [...m, { role: "user", text: msg }]);
    const collected: string[] = [];
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg, lang: readLang() }) });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "The coach is unavailable right now.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const data = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!data) continue;
          const ev = JSON.parse(data.slice(6));
          if (ev.type === "step") {
            collected.push(ev.label);
            setSteps([...collected]);
          } else if (ev.type === "text") {
            setMessages((m) => [...m, { role: "assistant", text: ev.text, steps: [...collected] }]);
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setSteps([]);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <PageHeader
        title="Coach"
        subtitle="An agent that reads your scans, shelf, trials and diary through tools — and never claims a change that's inside your noise band."
        action={
          <label className="flex items-center gap-2 text-xs text-muted">
            Reply in
            <select
              value={lang}
              onChange={(e) => pickLang(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
            >
              {Object.entries(REPLY_LANGUAGES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <div className="space-y-3">
        {messages.length === 0 && !busy && (
          <Card>
            <p className="mb-3 text-sm text-muted">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-3 py-1.5 text-left text-sm hover:bg-surface-2">
                  {s}
                </button>
              ))}
            </div>
          </Card>
        )}
        {messages.map((m, i) => (
          <div key={m.id ?? i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-accent text-accent-ink" : "border border-line bg-surface"}`}>
              {m.role === "assistant" && m.steps && m.steps.length > 0 && (
                <p className="mb-2 text-[11px] text-muted">Used {m.steps.length} tool{m.steps.length > 1 ? "s" : ""}</p>
              )}
              <Markdownish text={m.text} />
            </div>
          </div>
        ))}
        {busy && (
          <div className="max-w-[85%] rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
            <ul className="space-y-1 text-muted">
              {steps.map((s, i) => (
                <li key={i}>✓ {s}</li>
              ))}
              <li className="flex items-center gap-2">
                <Spinner className="text-accent" /> Thinking…
              </li>
            </ul>
          </div>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="sticky bottom-20 mt-4 flex gap-2 rounded-2xl border border-line bg-surface p-2 sm:bottom-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your skin, a product, a breakout…"
          className="flex-1 bg-transparent px-2 text-sm outline-none"
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          Send
        </Button>
      </form>
      <p className="mt-2 text-center text-[11px] text-muted">Not medical advice. For painful, spreading or bleeding skin issues, see a dermatologist.</p>
    </div>
  );
}

/** Read at send time so a question auto-sent from ?q= uses the saved language even before state catches up. */
function readLang(): string {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    return saved && saved in REPLY_LANGUAGES ? saved : "en";
  } catch {
    return "en";
  }
}

/** Minimal, safe rendering for the coach's short answers: paragraphs, bullets and **bold**. No HTML injection. */
function Markdownish({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>));
  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {inline(b.replace(/^#+\s*/gm, ""))}
          </p>
        );
      })}
    </div>
  );
}
