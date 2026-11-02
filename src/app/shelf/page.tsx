"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConflictList, type Conflict } from "@/components/conflict-list";
import { ProductInput, productInputToRequest } from "@/components/product-input";
import { RoutinePlanner } from "@/components/routine-planner";
import { inferCategory } from "@/lib/domain/routine";
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import { label } from "@/lib/client/labels";

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  ingredients: string[];
  actives: { active: string; label: string; matched: string; concerns: string[] }[];
  slot: "am" | "pm" | "both" | "none";
  onShelf: boolean;
  source: string;
};

const SLOTS = [
  { id: "am", label: "AM" },
  { id: "pm", label: "PM" },
  { id: "both", label: "Both" },
  { id: "none", label: "Not using" },
] as const;

export default function ShelfPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [trialFor, setTrialFor] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ products: Product[]; conflicts: Conflict[] }>("/api/products")
      .then((d) => {
        setProducts(d.products.filter((p) => p.onShelf));
        setConflicts(d.conflicts);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  // Jump to the planner when arriving via /shelf#routine (e.g. from the command palette) once content exists.
  useEffect(() => {
    if (products && window.location.hash === "#routine") document.getElementById("routine")?.scrollIntoView({ behavior: "smooth" });
  }, [products]);

  async function setSlot(id: string, slot: Product["slot"]) {
    setError(null);
    try {
      const d = await api<{ product: Product; conflicts: Conflict[] }>(`/api/products/${id}`, { method: "PATCH", json: { slot } });
      setProducts((ps) => ps?.map((p) => (p.id === id ? d.product : p)) ?? null);
      setConflicts(d.conflicts);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const d = await api<{ conflicts: Conflict[] }>(`/api/products/${id}`, { method: "DELETE" });
      setProducts((ps) => ps?.filter((p) => p.id !== id) ?? null);
      setConflicts(d.conflicts);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Ingredient-aware" title="Your shelf" subtitle="Add what you actually use, set when you use it, and SkinProof flags clashes and doubled-up actives between products in the same routine." />
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {products && products.length > 0 && <RoutinePlanner products={products} onApplied={load} />}
          {conflicts.length > 0 && (
            <Card>
              <h2 className="mb-3 font-medium">
                {conflicts.length} routine {conflicts.length === 1 ? "issue" : "issues"}
              </h2>
              <ConflictList conflicts={conflicts} />
            </Card>
          )}

          {products === null ? (
            <div className="flex justify-center py-10">
              <Spinner className="size-6 text-accent" />
            </div>
          ) : products.length === 0 ? (
            <Empty title="Your shelf is empty" body="Add a product by photographing its back label, pasting a link, or pasting the ingredient list." />
          ) : (
            <ul className="space-y-3">
              {products.map((p) => (
                <li key={p.id}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted">
                          {[p.brand, p.category ?? inferCategory(p)].filter(Boolean).join(" · ")} · {p.ingredients.length} ingredients
                        </p>
                      </div>
                      <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-xs">
                        {SLOTS.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setSlot(p.id, s.id)}
                            className={`rounded-md px-2.5 py-1 ${p.slot === s.id ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.actives.length ? (
                        p.actives.map((a) => (
                          <Badge key={a.active} tone="accent">
                            <span title={`matched "${a.matched}" · targets ${a.concerns.map(label).join(", ")}`}>{a.label}</span>
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted">No treatment actives — a basic/support product.</span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.actives.length > 0 && (
                        <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setTrialFor(trialFor === p.id ? null : p.id)}>
                          Test it for 28 days
                        </Button>
                      )}
                      <Button variant="ghost" className="px-3 py-1.5 text-xs text-muted" onClick={() => remove(p.id)}>
                        Remove
                      </Button>
                    </div>
                    {trialFor === p.id && <TrialStarter product={p} onStarted={() => router.push("/trials")} />}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card className="h-fit lg:sticky lg:top-20">
          <h2 className="mb-3 font-medium">Add a product</h2>
          <ProductInput
            submitLabel="Add to shelf"
            onSubmit={async (v) => {
              const req = await productInputToRequest(v);
              const d = await api<{ product: Product; conflicts: Conflict[] }>("/api/products", req);
              setProducts((ps) => [d.product, ...(ps ?? [])]);
              setConflicts(d.conflicts);
            }}
          />
        </Card>
      </div>
    </div>
  );
}

function TrialStarter({ product, onStarted }: { product: Product; onStarted: () => void }) {
  const options = [...new Set(product.actives.flatMap((a) => a.concerns))];
  const [picked, setPicked] = useState<string[]>(options.slice(0, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/trials", { method: "POST", json: { productId: product.id, targetConcerns: picked } });
      onStarted();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-surface-2 p-3">
      <p className="text-sm">
        Track up to 4 concerns. Keep everything else in your routine the same for 28 days and scan once a week — that&apos;s how you&apos;ll know{" "}
        <em>this</em> product did it.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((c) => {
          const on = picked.includes(c);
          return (
            <button
              key={c}
              onClick={() => setPicked(on ? picked.filter((x) => x !== c) : picked.length < 4 ? [...picked, c] : picked)}
              className={`rounded-full px-3 py-1 text-xs ${on ? "bg-accent text-accent-ink" : "bg-surface text-muted"}`}
            >
              {label(c)}
            </button>
          );
        })}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button onClick={start} disabled={busy || !picked.length}>
        {busy && <Spinner />} Start 28-day trial
      </Button>
    </div>
  );
}
