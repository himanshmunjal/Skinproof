import { Badge } from "./ui";

export type Conflict = {
  kind: "conflict" | "duplicate";
  severity: "avoid" | "caution";
  products: { id: string; name: string }[];
  actives: string[];
  slot: "am" | "pm";
  why: string;
  fix: string;
};

export function ConflictList({ conflicts, hideSlot = false }: { conflicts: Conflict[]; hideSlot?: boolean }) {
  return (
    <ul className="space-y-2">
      {conflicts.map((c, i) => (
        <li key={i} className={`rounded-xl border p-3 text-sm ${c.severity === "avoid" ? "border-bad/30 bg-bad-soft/50" : "border-warn/30 bg-warn-soft/50"}`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={c.severity === "avoid" ? "bad" : "warn"}>{c.kind === "duplicate" ? "Duplicate" : c.severity === "avoid" ? "Avoid together" : "Caution"}</Badge>
            {!hideSlot && <Badge>{c.slot.toUpperCase()}</Badge>}
            <span className="font-medium">{c.products.map((p) => (p.id === "__candidate__" ? "This product" : p.name)).join(" + ")}</span>
          </div>
          <p className="mt-1.5 text-muted">{c.why}</p>
          <p className="mt-1 font-medium">→ {c.fix}</p>
        </li>
      ))}
    </ul>
  );
}
