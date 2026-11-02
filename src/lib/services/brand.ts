import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

/** k-anonymity floor: a product only appears once this many consenting people have a Verified Result for it. */
export const MIN_REVIEWS = 3;

type Agg = {
  key: string;
  name: string;
  brand: string | null;
  n: number;
  ratings: number[];
  byConcern: Record<string, { deltas: number[]; improved: number; worse: number }>;
  quotes: string[];
};

/** Aggregated, anonymized Verified Results across all users (consent = true only). */
export async function brandInsights() {
  const d = await db();
  const rows = await d
    .select({ review: schema.verifiedReviews, product: schema.products })
    .from(schema.verifiedReviews)
    .innerJoin(schema.products, eq(schema.products.id, schema.verifiedReviews.productId))
    .where(eq(schema.verifiedReviews.consent, true));

  const groups = new Map<string, Agg>();
  for (const { review, product } of rows) {
    const key = `${(product.brand ?? "").toLowerCase().trim()}|${product.name.toLowerCase().trim()}`;
    const g = groups.get(key) ?? { key, name: product.name, brand: product.brand, n: 0, ratings: [], byConcern: {}, quotes: [] };
    g.n++;
    g.ratings.push(review.rating);
    if (review.body.trim()) g.quotes.push(review.body.trim());
    for (const c of review.deltas) {
      const bc = (g.byConcern[c.concern] ??= { deltas: [], improved: 0, worse: 0 });
      bc.deltas.push(c.delta);
      if (c.label === "improved") bc.improved++;
      if (c.label === "worse") bc.worse++;
    }
    groups.set(key, g);
  }

  const visible = [...groups.values()].filter((g) => g.n >= MIN_REVIEWS);
  return {
    minReviews: MIN_REVIEWS,
    hiddenProducts: groups.size - visible.length,
    products: visible
      .map((g) => ({
        name: g.name,
        brand: g.brand,
        n: g.n,
        avgRating: Math.round((g.ratings.reduce((a, b) => a + b, 0) / g.n) * 10) / 10,
        concerns: Object.entries(g.byConcern)
          .map(([concern, v]) => ({
            concern,
            n: v.deltas.length,
            meanDelta: Math.round((v.deltas.reduce((a, b) => a + b, 0) / v.deltas.length) * 10) / 10,
            pctImproved: Math.round((v.improved / v.deltas.length) * 100),
            pctWorse: Math.round((v.worse / v.deltas.length) * 100),
          }))
          .sort((a, b) => b.n - a.n),
        quotes: g.quotes.slice(0, 3),
      }))
      .sort((a, b) => b.n - a.n),
  };
}
