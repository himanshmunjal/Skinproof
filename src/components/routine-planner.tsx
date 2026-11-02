"use client";

import { useMemo, useState } from "react";
import type { Slot } from "@/lib/domain/ingredients";
import { planRoutine, type RoutineMove, type RoutineProduct, type RoutineStep } from "@/lib/domain/routine";
import { api } from "@/lib/client/api";
import { Icon } from "./icons";
import { Badge, Button, Card, ErrorNote, Spinner } from "./ui";

/** Slot after applying a planner move to a product's current slot. */
function slotAfter(slot: Slot, m: RoutineMove): Slot {
  const am = slot === "am" || slot === "both";
  const pm = slot === "pm" || slot === "both";
  const next = { am, pm };
  next[m.from] = false;
  if (m.to !== "removed") next[m.to] = true;
  return next.am && next.pm ? "both" : next.am ? "am" : next.pm ? "pm" : "none";
}

export function RoutinePlanner({ products, onApplied }: { products: RoutineProduct[]; onApplied: () => void }) {
  const plan = useMemo(() => planRoutine(products), [products]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = (new Date().getDay() + 6) % 7; // Mon = 0
  const tonight = plan.nights[plan.week[today]?.night ?? 0];

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const slots = new Map(products.map((p) => [p.id, p.slot]));
      for (const m of plan.moves) slots.set(m.productId, slotAfter(slots.get(m.productId) ?? "none", m));
      const changed = products.filter((p) => slots.get(p.id) !== p.slot);
      for (const p of changed) await api(`/api/products/${p.id}`, { method: "PATCH", json: { slot: slots.get(p.id) } });
      onApplied();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!products.some((p) => p.slot !== "none")) {
    return (
      <Card id="routine" className="scroll-mt-24">
        <h2 className="font-medium">Your routine</h2>
        <p className="mt-1 text-sm text-muted">Set products to AM, PM or Both and SkinProof builds a clash-free routine with the right order.</p>
      </Card>
    );
  }

  return (
    <Card id="routine" className="scroll-mt-24 space-y-4 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Routine planner</p>
          <h2 className="font-display mt-1 text-xl font-semibold">Your clash-free routine</h2>
          <p className="mt-1 text-sm text-muted">Ordered thinnest to thickest. Clashing night actives get their own evenings.</p>
        </div>
        <div className="flex items-center gap-2">
          {plan.clashesBefore > 0 ? (
            <Badge tone={plan.clashesAfter === 0 ? "good" : "warn"}>
              {plan.clashesBefore} clash{plan.clashesBefore > 1 ? "es" : ""} → {plan.clashesAfter}
            </Badge>
          ) : (
            <Badge tone="good">No clashes</Badge>
          )}
        </div>
      </div>

      {plan.moves.length > 0 && (
        <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-3">
          <p className="text-sm font-medium">Suggested changes</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {plan.moves.map((m) => (
              <li key={`${m.productId}-${m.from}`} className="flex gap-2">
                <Icon name="arrow" className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>
                  <strong>{m.name}</strong>: {m.to === "removed" ? `drop from ${m.from.toUpperCase()}` : `${m.from.toUpperCase()} → ${m.to.toUpperCase()}`}.{" "}
                  <span className="text-muted">{m.why}</span>
                </span>
              </li>
            ))}
          </ul>
          {error && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}
          <Button className="mt-3 px-3 py-1.5 text-xs" onClick={apply} disabled={busy}>
            {busy && <Spinner />} Apply to my shelf
          </Button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Routine title="Morning" icon="sun" steps={plan.am} empty="Nothing set for the morning." />
        <Routine
          title={plan.nights.length > 1 ? `Tonight · ${tonight.label}` : "Evening"}
          icon="moon"
          steps={tonight?.steps ?? []}
          empty="Nothing set for the evening."
        />
      </div>

      {plan.nights.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-medium">Your week</p>
          <div className="grid grid-cols-7 gap-1.5">
            {plan.week.map((d, i) => {
              const night = plan.nights[d.night];
              const recovery = night.key === "recovery";
              return (
                <div
                  key={d.day}
                  title={`${night.label}: ${night.steps.map((s) => s.name).join(", ") || "rest"}`}
                  className={`rounded-xl px-1 py-2 text-center ${i === today ? "ring-2 ring-accent" : ""} ${recovery ? "bg-surface-2" : d.night % 2 ? "bg-accent-2/15" : "bg-accent-soft"}`}
                >
                  <div className="text-[11px] font-medium text-muted">{d.day}</div>
                  <div className="mt-0.5 truncate text-[11px] font-semibold leading-tight">{night.label.replace(" night", "")}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {plan.tips.length > 0 && (
        <ul className="space-y-1 text-sm text-muted">
          {plan.tips.map((t) => (
            <li key={t} className="flex gap-2">
              <Icon name="sparkle" className="mt-0.5 size-4 shrink-0 text-accent-2" />
              {t}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Routine({ title, icon, steps, empty }: { title: string; icon: "sun" | "moon"; steps: RoutineStep[]; empty: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Icon name={icon} className="size-4 text-accent" />
        {title}
      </p>
      {steps.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ol className="space-y-1.5">
          {steps.map((s, i) => (
            <li key={s.productId} className="flex items-center gap-2.5 text-sm">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-semibold text-muted shadow-card">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="shrink-0 text-xs text-muted">{s.step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
