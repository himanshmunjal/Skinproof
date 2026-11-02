"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import { label } from "@/lib/client/labels";

type Insights = {
  minReviews: number;
  hiddenProducts: number;
  products: {
    name: string;
    brand: string | null;
    n: number;
    avgRating: number;
    concerns: { concern: string; n: number; meanDelta: number; pctImproved: number; pctWorse: number }[];
    quotes: string[];
  }[];
};

export default function BrandPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Insights>("/api/brand")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verified Results — for brands"
        subtitle={
          <>
            Reviews backed by measured skin change, not star ratings alone. Every number below comes from a 28-day single-product trial with
            noise-calibrated YouCam scans. Anonymized; a product appears only after {data?.minReviews ?? 3}+ consenting reviewers.
          </>
        }
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-accent" />
        </div>
      )}
      {data && data.products.length === 0 && (
        <Empty
          title="No products have enough Verified Results yet"
          body={`${data.hiddenProducts} product(s) have reviews but fewer than ${data.minReviews}. Load the demo data from the home page to see this view populated.`}
        />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.products.map((p) => (
          <Card key={`${p.brand}|${p.name}`} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">{p.brand ?? "—"}</p>
                <p className="font-display text-lg font-semibold">{p.name}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl font-semibold">{p.n}</p>
                <p className="text-[11px] text-muted">verified trials · ★{p.avgRating}</p>
              </div>
            </div>
            <ul className="space-y-2">
              {p.concerns.map((c) => (
                <li key={c.concern} className="text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium">{label(c.concern)}</span>
                    <span className="text-xs text-muted">
                      mean {c.meanDelta >= 0 ? "+" : ""}
                      {c.meanDelta} · n={c.n}
                    </span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-noise-soft">
                    <div className="bg-good" style={{ width: `${c.pctImproved}%` }} />
                    <div className="ml-auto bg-bad" style={{ width: `${c.pctWorse}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {c.pctImproved}% measurably improved · {c.pctWorse}% worse · rest within noise
                  </p>
                </li>
              ))}
            </ul>
            {p.quotes.length > 0 && (
              <div className="space-y-1.5 border-t border-line pt-3">
                {p.quotes.map((q, i) => (
                  <p key={i} className="text-sm italic text-muted">
                    “{q}”
                  </p>
                ))}
              </div>
            )}
            <Badge tone="accent">Measured with YouCam AI Skin Analysis</Badge>
            <BadgePreview product={p} />
          </Card>
        ))}
      </div>

      <BusinessModel />
    </div>
  );
}

/** What a brand or retailer could show on a product page: the strongest measured result, with its sample size. */
function BadgePreview({ product }: { product: Insights["products"][number] }) {
  const best = [...product.concerns].sort((a, b) => b.pctImproved - a.pctImproved)[0];
  if (!best) return null;
  return (
    <div className="rounded-xl border border-dashed border-line p-3">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-muted">Product-page badge preview</p>
      <div className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-ink">✓</span>
        <p className="text-xs leading-snug">
          <strong>SkinProof Verified</strong> · {best.pctImproved}% of {best.n} testers measurably improved {label(best.concern).toLowerCase()} in 28 days
        </p>
      </div>
    </div>
  );
}

const MODEL = [
  {
    who: "Brands",
    what: "Efficacy dashboard",
    body: "Real-world, measured outcomes by concern for their products and competitors' — evidence for claims, reformulation and launches. Subscription.",
  },
  {
    who: "Retailers",
    what: "“Will this work for me?” widget",
    body: "The Before-you-buy check and the Verified badge on product pages. Fewer returns, higher conversion. Priced per check.",
  },
  {
    who: "Users",
    what: "Free, always",
    body: "Users get the measurement and keep control of their data. Nothing is shared without consent, and only in groups of 3+.",
  },
];

function BusinessModel() {
  return (
    <section className="space-y-3 border-t border-line pt-6">
      <h2 className="font-display text-xl font-semibold">How this becomes a business</h2>
      <p className="max-w-2xl text-sm text-muted">
        Star ratings measure opinion. Verified Results measure skin: one product, 28 days, noise-calibrated scans. That data can only come from
        people actually running trials — which is why it&apos;s worth paying for.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {MODEL.map((m) => (
          <Card key={m.who}>
            <p className="text-xs uppercase tracking-wide text-accent">{m.who}</p>
            <p className="mt-1 font-medium">{m.what}</p>
            <p className="mt-1 text-sm text-muted">{m.body}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
