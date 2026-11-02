import { and, desc, eq } from "drizzle-orm";
import { extractFromLabelPhoto, extractFromUrl, type ProductExtract } from "@/lib/llm";
import { db, schema } from "@/lib/db/client";
import { assessFit, detectActives, findConflicts, splitInciList, type ShelfItem, type Slot } from "@/lib/domain/ingredients";
import { CONCERN_LABELS } from "@/lib/youcam/concerns";
import { normalizeLabelPhoto, storeImage } from "./images";
import { weakestConcerns } from "./scans";
import { assertDailyQuota } from "./usage";

export type ProductRow = typeof schema.products.$inferSelect;
export type ProductInput = { photo?: Buffer; url?: string; text?: string; name?: string; brand?: string };

export class ProductInputError extends Error {}

/** Resolve any of the three input kinds into a product extract (photo/url use the LLM; text is deterministic). */
async function extract(userId: string, input: ProductInput): Promise<{ extract: ProductExtract; source: "photo" | "url" | "text"; imageId?: string }> {
  if (input.photo || input.url) await assertDailyQuota(userId, "llm");
  if (input.photo) {
    const img = await normalizeLabelPhoto(input.photo);
    const extract = await extractFromLabelPhoto(userId, img.bytes);
    const imageId = await storeImage(userId, "product", img);
    return { extract, source: "photo", imageId };
  }
  if (input.url) {
    let u: URL;
    try {
      u = new URL(input.url);
    } catch {
      throw new ProductInputError("That doesn't look like a valid URL.");
    }
    if (!["http:", "https:"].includes(u.protocol)) throw new ProductInputError("Only http(s) links are supported.");
    return { extract: await extractFromUrl(userId, u.toString()), source: "url" };
  }
  if (input.text) {
    const ingredients = splitInciList(input.text);
    if (!ingredients.length) throw new ProductInputError("Paste the ingredient list (comma-separated).");
    return {
      extract: { found: true, name: input.name?.trim() || "Unnamed product", brand: input.brand?.trim() || null, category: null, ingredients },
      source: "text",
    };
  }
  throw new ProductInputError("Add a label photo, a product link or the ingredient list.");
}

export async function addProduct(userId: string, input: ProductInput & { slot?: Slot }) {
  const { extract: ex, source, imageId } = await extract(userId, input);
  if (!ex.found || !ex.ingredients.length) {
    throw new ProductInputError("Couldn't find an ingredient list. Try a clearer photo of the back label, or paste the ingredients.");
  }
  const d = await db();
  const [product] = await d
    .insert(schema.products)
    .values({
      userId,
      name: input.name?.trim() || ex.name,
      brand: input.brand?.trim() || ex.brand,
      category: ex.category,
      ingredients: ex.ingredients,
      actives: detectActives(ex.ingredients),
      source,
      sourceUrl: input.url ?? null,
      imageId: imageId ?? null,
      slot: input.slot ?? "none",
    })
    .returning();
  return { product, conflicts: await shelfConflicts(userId) };
}

export async function listProducts(userId: string, opts: { onShelfOnly?: boolean } = {}) {
  const d = await db();
  const where = opts.onShelfOnly
    ? and(eq(schema.products.userId, userId), eq(schema.products.onShelf, true))
    : eq(schema.products.userId, userId);
  return d.select().from(schema.products).where(where).orderBy(desc(schema.products.createdAt));
}

export async function getProduct(userId: string, id: string) {
  const d = await db();
  const [p] = await d.select().from(schema.products).where(and(eq(schema.products.id, id), eq(schema.products.userId, userId)));
  return p ?? null;
}

export async function updateProduct(userId: string, id: string, patch: { slot?: Slot; onShelf?: boolean }) {
  const d = await db();
  const [p] = await d
    .update(schema.products)
    .set(patch)
    .where(and(eq(schema.products.id, id), eq(schema.products.userId, userId)))
    .returning();
  return p ?? null;
}

export async function deleteProduct(userId: string, id: string) {
  const d = await db();
  await d.delete(schema.products).where(and(eq(schema.products.id, id), eq(schema.products.userId, userId)));
}

const toShelfItem = (p: ProductRow): ShelfItem => ({ id: p.id, name: p.name, slot: p.slot, actives: p.actives });

export async function shelfConflicts(userId: string) {
  return findConflicts((await listProducts(userId, { onShelfOnly: true })).map(toShelfItem));
}

/** Pre-purchase check: extract the candidate (not saved), then score it against the user's skin + shelf. */
export async function checkProduct(userId: string, input: ProductInput) {
  const { extract: ex } = await extract(userId, input);
  if (!ex.found || !ex.ingredients.length) {
    throw new ProductInputError("Couldn't find an ingredient list for that product. Paste the ingredients instead.");
  }
  const actives = detectActives(ex.ingredients);
  const shelf = (await listProducts(userId, { onShelfOnly: true })).map(toShelfItem);
  const weakest = await weakestConcerns(userId, 3);
  const fit = assessFit({ name: ex.name, actives }, shelf, weakest, CONCERN_LABELS);
  return {
    product: { name: input.name?.trim() || ex.name, brand: ex.brand, category: ex.category, ingredients: ex.ingredients, actives, sourceUrl: input.url ?? null },
    weakest,
    hasScan: weakest.length > 0,
    fit,
  };
}
