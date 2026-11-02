import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

export type DiaryInput = {
  day?: string;
  sleepHours?: number | null;
  stress?: number | null;
  waterLiters?: number | null;
  newProducts?: string | null;
  diet?: string | null;
  cycleDay?: number | null;
  notes?: string | null;
};

const clampNum = (v: unknown, lo: number, hi: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null);

export async function addDiaryEntry(userId: string, input: DiaryInput) {
  const day = input.day && /^\d{4}-\d{2}-\d{2}$/.test(input.day) ? input.day : new Date().toISOString().slice(0, 10);
  const d = await db();
  const [row] = await d
    .insert(schema.diaryEntries)
    .values({
      userId,
      day,
      sleepHours: clampNum(input.sleepHours, 0, 24),
      stress: clampNum(input.stress, 1, 5),
      waterLiters: clampNum(input.waterLiters, 0, 10),
      cycleDay: clampNum(input.cycleDay, 1, 60),
      newProducts: str(input.newProducts),
      diet: str(input.diet),
      notes: str(input.notes),
    })
    .returning();
  return row;
}

export async function listDiary(userId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const d = await db();
  return d
    .select()
    .from(schema.diaryEntries)
    .where(and(eq(schema.diaryEntries.userId, userId), gte(schema.diaryEntries.day, since)))
    .orderBy(desc(schema.diaryEntries.day), desc(schema.diaryEntries.createdAt));
}
