"use client";

import { useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Card, ErrorNote, PageHeader } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fmtDate } from "@/lib/client/labels";

type Entry = {
  id: string;
  day: string;
  sleepHours: number | null;
  stress: number | null;
  waterLiters: number | null;
  newProducts: string | null;
  diet: string | null;
  cycleDay: number | null;
  notes: string | null;
};

const empty = { sleepHours: "", stress: "3", waterLiters: "", newProducts: "", diet: "", cycleDay: "", notes: "" };

export default function BreakoutPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState(empty);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ entries: Entry[] }>("/api/diary")
      .then((d) => setEntries(d.entries))
      .catch((e) => setError(e.message));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { entry } = await api<{ entry: Entry }>("/api/diary", {
        method: "POST",
        json: {
          sleepHours: form.sleepHours,
          stress: Number(form.stress),
          waterLiters: form.waterLiters,
          newProducts: form.newProducts,
          diet: form.diet,
          cycleDay: form.cycleDay,
          notes: form.notes,
        },
      });
      setEntries((x) => [entry, ...x]);
      setForm(empty);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const input = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Right after a bad breakout" title="Breakout triage" subtitle="Right after a bad breakout: scan it, log what changed, and let the coach rank the likely triggers." />

      <div className="grid gap-3 sm:grid-cols-3">
        <StepCard n={1} title="Scan the breakout" body="Captures acne, redness and texture against your baseline.">
          <ButtonLink href="/scan?type=breakout">Breakout scan</ButtonLink>
        </StepCard>
        <StepCard n={2} title="Log the last few days" body="Sleep, stress, new products, diet, cycle. Takes 20 seconds.">
          <a href="#log" className="text-sm font-medium text-accent">
            Log below ↓
          </a>
        </StepCard>
        <StepCard n={3} title="Get a triage plan" body="The coach compares scans, diary and shelf changes.">
          <ButtonLink
            href={`/coach?q=${encodeURIComponent("I'm having a breakout. Look at my latest scan vs before, my diary and any new products on my shelf. What are the most likely triggers and what should I do tonight?")}`}
          >
            Ask the coach
          </ButtonLink>
        </StepCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        <Card id="log" className="h-fit">
          <h2 className="mb-3 font-medium">Today&apos;s log</h2>
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                Sleep (hours)
                <input className={input} inputMode="decimal" value={form.sleepHours} onChange={set("sleepHours")} />
              </label>
              <label className="text-xs text-muted">
                Stress (1–5)
                <select className={input} value={form.stress} onChange={set("stress")}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                Water (litres)
                <input className={input} inputMode="decimal" value={form.waterLiters} onChange={set("waterLiters")} />
              </label>
              <label className="text-xs text-muted">
                Cycle day (optional)
                <input className={input} inputMode="numeric" value={form.cycleDay} onChange={set("cycleDay")} />
              </label>
            </div>
            <input className={input} placeholder="New products this week?" value={form.newProducts} onChange={set("newProducts")} />
            <input className={input} placeholder="Diet notes (dairy, sugar, alcohol…)" value={form.diet} onChange={set("diet")} />
            <textarea className={`${input} min-h-16`} placeholder="Anything else? (mask wearing, workouts, travel…)" value={form.notes} onChange={set("notes")} />
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit">{saved ? "Saved ✓ — add another" : "Save entry"}</Button>
          </form>
        </Card>

        <Card className="p-0 sm:p-0">
          <h2 className="border-b border-line px-4 py-3 text-sm font-medium">Recent entries</h2>
          {entries.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No entries yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {entries.map((e) => (
                <li key={e.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{fmtDate(e.day)}</span>
                    {e.sleepHours !== null && <Badge>{e.sleepHours}h sleep</Badge>}
                    {e.stress !== null && <Badge tone={e.stress >= 4 ? "warn" : "noise"}>stress {e.stress}/5</Badge>}
                    {e.cycleDay !== null && <Badge>cycle day {e.cycleDay}</Badge>}
                  </div>
                  {e.newProducts && <p className="text-muted">New: {e.newProducts}</p>}
                  {e.diet && <p className="text-muted">Diet: {e.diet}</p>}
                  {e.notes && <p className="text-muted">{e.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function StepCard({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-2">
      <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{n}</span>
      <p className="font-medium">{title}</p>
      <p className="flex-1 text-sm text-muted">{body}</p>
      <div>{children}</div>
    </Card>
  );
}
