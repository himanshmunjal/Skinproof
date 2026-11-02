import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

// Anonymous cookie identity (DECISION D-14). Only call from Route Handlers — they are allowed to set cookies.
export const USER_COOKIE = "sp_uid";
export const DEMO_USER_ID = "de000000-0000-4000-8000-000000000001";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type User = typeof schema.users.$inferSelect;

function setCookie(store: Awaited<ReturnType<typeof cookies>>, id: string) {
  store.set(USER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function currentUser(): Promise<User> {
  const store = await cookies();
  const d = await db();
  const id = store.get(USER_COOKIE)?.value;
  if (id && UUID_RE.test(id)) {
    const [existing] = await d.select().from(schema.users).where(eq(schema.users.id, id));
    if (existing) return existing;
  }
  const [created] = await d.insert(schema.users).values({}).returning();
  setCookie(store, created.id);
  return created;
}

export async function switchToDemoUser(): Promise<User | null> {
  const d = await db();
  const [demo] = await d.select().from(schema.users).where(eq(schema.users.id, DEMO_USER_ID));
  if (!demo) return null;
  setCookie(await cookies(), demo.id);
  return demo;
}

export async function startFresh(): Promise<User> {
  const d = await db();
  const [created] = await d.insert(schema.users).values({}).returning();
  setCookie(await cookies(), created.id);
  return created;
}

/** "Delete my data" — cascades to images, scans, products, trials, diary, chat, reviews. */
export async function deleteUser(id: string): Promise<void> {
  if (id === DEMO_USER_ID) throw new Error("The shared demo account can't be deleted.");
  const d = await db();
  await d.delete(schema.users).where(eq(schema.users.id, id));
  (await cookies()).delete(USER_COOKIE);
}
