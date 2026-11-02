import { eq, sql } from "drizzle-orm";
import { config } from "@/lib/config";
import { db, schema } from "@/lib/db/client";
import { DEMO_USER_ID } from "./users";

// Dev-only "skip ahead" (DECISION D-34). Instead of faking a clock, every dated record of one user moves N days
// into the past. All verdicts compare against the real `now`, so the next real scan lands N days after the
// previous one and trials, noise pairing and charts behave exactly as if the time had passed.

export class TimeTravelError extends Error {}

export const MAX_SKIP_DAYS = 28;

export async function skipAhead(userId: string, days: number): Promise<{ shiftDays: number }> {
  if (!config().DEV_TIME_TRAVEL) throw new TimeTravelError("Time travel is off. Set DEV_TIME_TRAVEL=true in .env to use it.");
  if (userId === DEMO_USER_ID) throw new TimeTravelError("The shared demo account can't be time-shifted. Start your own account first.");
  if (!Number.isInteger(days) || days < 1 || days > MAX_SKIP_DAYS) throw new TimeTravelError(`Skip between 1 and ${MAX_SKIP_DAYS} days.`);

  const back = (col: unknown) => sql`${col} - make_interval(days => ${days})`;
  const d = await db();
  return d.transaction(async (tx) => {
    const s = schema;
    await tx.update(s.scans).set({ createdAt: back(s.scans.createdAt), completedAt: back(s.scans.completedAt) }).where(eq(s.scans.userId, userId));
    await tx.update(s.images).set({ createdAt: back(s.images.createdAt) }).where(eq(s.images.userId, userId));
    await tx.update(s.products).set({ createdAt: back(s.products.createdAt) }).where(eq(s.products.userId, userId));
    await tx
      .update(s.trials)
      .set({ startAt: back(s.trials.startAt), endAt: back(s.trials.endAt), createdAt: back(s.trials.createdAt) })
      .where(eq(s.trials.userId, userId));
    await tx
      .update(s.diaryEntries)
      .set({ day: sql`${s.diaryEntries.day} - ${days}::int`, createdAt: back(s.diaryEntries.createdAt) })
      .where(eq(s.diaryEntries.userId, userId));
    await tx.update(s.chatMessages).set({ createdAt: back(s.chatMessages.createdAt) }).where(eq(s.chatMessages.userId, userId));
    await tx.update(s.verifiedReviews).set({ createdAt: back(s.verifiedReviews.createdAt) }).where(eq(s.verifiedReviews.userId, userId));
    await tx.update(s.experiments).set({ createdAt: back(s.experiments.createdAt) }).where(eq(s.experiments.userId, userId));
    await tx.update(s.noiseProfiles).set({ updatedAt: back(s.noiseProfiles.updatedAt) }).where(eq(s.noiseProfiles.userId, userId));
    const [u] = await tx
      .update(s.users)
      .set({ timeShiftDays: sql`${s.users.timeShiftDays} + ${days}`, createdAt: back(s.users.createdAt) })
      .where(eq(s.users.id, userId))
      .returning({ shiftDays: s.users.timeShiftDays });
    return { shiftDays: u.shiftDays };
  });
}
