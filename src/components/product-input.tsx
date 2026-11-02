"use client";

import { useRef, useState } from "react";
import { Button, ErrorNote, Spinner } from "./ui";

export type ProductInputValue = { kind: "photo"; file: File; name?: string } | { kind: "url"; url: string } | { kind: "text"; text: string; name?: string };

const TABS = [
  { id: "photo", label: "Label photo" },
  { id: "url", label: "Product link" },
  { id: "text", label: "Paste ingredients" },
] as const;

/** Shared input for the shelf and the pre-purchase check: photo (vision model), URL (server fetch + LLM) or pasted INCI. */
export function ProductInput({ submitLabel, onSubmit }: { submitLabel: string; onSubmit: (v: ProductInputValue) => Promise<void> }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("text");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let v: ProductInputValue | null = null;
    if (tab === "photo" && file) v = { kind: "photo", file, name: name || undefined };
    if (tab === "url" && url.trim()) v = { kind: "url", url: url.trim() };
    if (tab === "text" && text.trim()) v = { kind: "text", text, name: name || undefined };
    if (!v) return setError(tab === "photo" ? "Choose a photo of the back label." : tab === "url" ? "Paste a product link." : "Paste the ingredient list.");
    setBusy(true);
    try {
      await onSubmit(v);
      setText("");
      setUrl("");
      setName("");
      setFile(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="inline-flex rounded-xl bg-surface-2 p-1 text-sm">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 ${tab === t.id ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "url" && <input className={input} placeholder="Product name (optional)" value={name} onChange={(e) => setName(e.target.value)} />}
      {tab === "photo" && (
        <div className="flex items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
            {file ? "Change photo" : "Choose photo"}
          </Button>
          <span className="truncate text-sm text-muted">{file ? file.name : "Back of the pack, ingredients legible"}</span>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      )}
      {tab === "url" && <input className={input} type="url" placeholder="https://brand.com/products/…" value={url} onChange={(e) => setUrl(e.target.value)} />}
      {tab === "text" && (
        <textarea
          className={`${input} min-h-28`}
          placeholder="Aqua, Niacinamide, Pentylene Glycol, Zinc PCA, …"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" disabled={busy}>
        {busy && <Spinner />} {busy ? (tab === "text" ? "Checking…" : "Reading the product…") : submitLabel}
      </Button>
      {tab !== "text" && <p className="text-xs text-muted">Photos and links are read by AI; the clash rules themselves are fixed and explainable.</p>}
    </form>
  );
}

export async function productInputToRequest(v: ProductInputValue): Promise<RequestInit & { json?: unknown }> {
  if (v.kind === "photo") {
    const form = new FormData();
    form.append("image", v.file);
    if (v.name) form.append("name", v.name);
    return { method: "POST", body: form };
  }
  return { method: "POST", json: v.kind === "url" ? { url: v.url } : { text: v.text, name: v.name } };
}
