"use client";

import { useState } from "react";
import { ConflictList, type Conflict } from "@/components/conflict-list";
import { ProductInput, productInputToRequest } from "@/components/product-input";
import { Badge, Button, ButtonLink, Card, ErrorNote, PageHeader } from "@/components/ui";
import { api } from "@/lib/client/api";
import { label } from "@/lib/client/labels";

type Check = {
  product: { name: string; brand: string | null; ingredients: string[]; actives: { active: string; label: string; concerns: string[] }[] };
  weakest: string[];
  hasScan: boolean;
  fit: {
    verdict: "buy" | "buy_with_care" | "skip" | "not_for_you";
    headline: string;
    matches: { concern: string; actives: string[] }[];
    conflicts: Conflict[];
    duplicates: Conflict[];
    advice: string[];
  };
};

const VERDICT = {
  buy: { title: "Good buy for you", cls: "border-good/40 bg-good-soft/60 text-good" },
  buy_with_care: { title: "Buy — with care", cls: "border-warn/40 bg-warn-soft/60 text-warn" },
  skip: { title: "Skip it", cls: "border-bad/40 bg-bad-soft/60 text-bad" },
  not_for_you: { title: "Not for your skin goals", cls: "border-line bg-noise-soft text-noise" },
};

export default function CheckPage() {
  const [result, setResult] = useState<Check | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addToShelf() {
    if (!result) return;
    setError(null);
    try {
      await api("/api/products", { method: "POST", json: { text: result.product.ingredients.join(", "), name: result.product.name, brand: result.product.brand } });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Right before a purchase"
        title="Before you buy"
        subtitle="Standing in the aisle or about to check out? Get a yes/no based on your latest scan and what's already on your shelf."
      />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card className="h-fit">
          <ProductInput
            submitLabel="Check this product"
            onSubmit={async (v) => {
              setSaved(false);
              setResult(await api<Check>("/api/check", await productInputToRequest(v)));
            }}
          />
        </Card>

        <div className="space-y-4">
          {!result && (
            <Card className="text-sm text-muted">
              Try pasting: <code className="text-ink">Aqua, Glycolic Acid, Glycerin, Sodium Hydroxide</code> — then add a retinol to your shelf (PM) and check
              again to see a clash.
            </Card>
          )}
          {result && (
            <>
              <div className={`animate-rise rounded-2xl border p-5 shadow-card ${VERDICT[result.fit.verdict].cls}`}>
                <p className="text-xs font-medium uppercase tracking-wide">{result.product.name}</p>
                <p className="font-display mt-1 text-2xl font-semibold">{VERDICT[result.fit.verdict].title}</p>
                <p className="mt-1 text-ink">{result.fit.headline}</p>
              </div>
              {!result.hasScan && (
                <Card className="text-sm">
                  You haven&apos;t scanned yet, so this can&apos;t be matched to your skin. <ButtonLink href="/scan" variant="ghost">Scan first →</ButtonLink>
                </Card>
              )}
              <Card>
                <h2 className="mb-2 text-sm font-medium">Actives found</h2>
                <div className="flex flex-wrap gap-1.5">
                  {result.product.actives.length ? (
                    result.product.actives.map((a) => (
                      <Badge key={a.active} tone="accent">
                        {a.label}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted">None recognized.</span>
                  )}
                </div>
                {result.weakest.length > 0 && (
                  <p className="mt-3 text-sm text-muted">
                    Your weakest areas: {result.weakest.map(label).join(", ")}.{" "}
                    {result.fit.matches.length > 0 && <>This targets {result.fit.matches.map((m) => label(m.concern)).join(", ")}.</>}
                  </p>
                )}
                {result.fit.advice.map((a) => (
                  <p key={a} className="mt-2 text-sm">
                    ☀ {a}
                  </p>
                ))}
              </Card>
              {[...result.fit.duplicates, ...result.fit.conflicts].length > 0 && (
                <Card>
                  <h2 className="mb-3 text-sm font-medium">With your current shelf</h2>
                  <ConflictList conflicts={[...result.fit.duplicates, ...result.fit.conflicts]} hideSlot />
                </Card>
              )}
              {error && <ErrorNote>{error}</ErrorNote>}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={addToShelf} disabled={saved}>
                  {saved ? "Added to shelf ✓" : "I bought it — add to shelf"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
