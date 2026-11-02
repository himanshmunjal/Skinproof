"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/client/api";

type Me = { user: { isDemo: boolean; timeShiftDays: number }; system: { timeTravel: boolean } };

/**
 * Dev-only panel (DECISION D-34): moves this account's records N days into the past so the next real scan
 * lands N days later. Hidden unless DEV_TIME_TRAVEL=true, and never shown on the shared demo account.
 */
export function TimeTravel({ onChange }: { onChange?: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/api/me").then(setMe, () => {});
  }, []);

  if (!me?.system.timeTravel || me.user.isDemo) return null;

  async function skip(days: number) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ shiftDays: number }>("/api/dev/time-travel", { method: "POST", json: { days } });
      setMe((m) => (m ? { ...m, user: { ...m.user, timeShiftDays: r.shiftDays } } : m));
      onChange?.();
      window.dispatchEvent(new Event("skinproof:time-travel"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-dashed border-warn bg-warn-soft/40">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto text-sm">
          <p className="font-medium text-warn">Developer time travel</p>
          <p className="text-muted">
            Moves your scans, trials and diary into the past, so your next real scan counts as later.
            {me.user.timeShiftDays > 0 && <> Shifted so far: <strong>{me.user.timeShiftDays} days</strong>.</>}
          </p>
        </div>
        {[1, 7, 14].map((d) => (
          <Button key={d} variant="secondary" disabled={busy} onClick={() => skip(d)}>
            +{d} day{d > 1 ? "s" : ""}
          </Button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </Card>
  );
}
