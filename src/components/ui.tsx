import Link from "next/link";
import { useId, type ComponentProps, type ReactNode } from "react";
import { strength } from "@/lib/client/labels";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5 ${className}`} {...props} />;
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink shadow-[0_6px_20px_-8px_var(--accent)] hover:-translate-y-px hover:shadow-[0_10px_24px_-8px_var(--accent)] active:translate-y-0",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
  danger: "border border-bad/30 bg-bad-soft text-bad hover:opacity-90",
};
const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${base} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${base} ${VARIANTS[variant]} ${className}`} {...props} />;
}

type Tone = "good" | "bad" | "warn" | "noise" | "accent";
const TONES: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  noise: "bg-noise-soft text-noise",
  accent: "bg-accent-soft text-accent",
};

export function Badge({ tone = "noise", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, action, eyebrow }: { title: string; subtitle?: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex animate-rise flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 py-10 text-center">
      <p className="font-medium">{title}</p>
      {body && <p className="max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{children}</p>;
}

export function ScoreRing({ value, size = 96, label, max = 100 }: { value: number | null; size?: number; label?: string; max?: number }) {
  const gid = `ring${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const v = Math.max(0, Math.min(max, value ?? 0));
  const stroke = size >= 80 ? 7 : 5;
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / max)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.2,0.7,0.2,1)" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-display text-2xl font-semibold leading-none">{value ?? "–"}</div>
        {label && <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">{label}</div>}
      </div>
    </div>
  );
}

const CHANGE: Record<string, { tone: Tone; text: (d: number) => string }> = {
  improved: { tone: "good", text: (d) => `▲ ${d.toFixed(1)}` },
  worse: { tone: "bad", text: (d) => `▼ ${Math.abs(d).toFixed(1)}` },
  within_noise: { tone: "noise", text: () => "within noise" },
};

/** Change badge. With a threshold it also shows the change in noise bands ("2.1×") and explains it on hover. */
export function ChangeChip({ label, delta, threshold }: { label: string; delta: number; threshold?: number }) {
  const c = CHANGE[label] ?? CHANGE.within_noise;
  const s = threshold === undefined ? null : strength(delta, threshold);
  return (
    <span title={s?.text}>
      <Badge tone={c.tone}>
        {c.text(delta)}
        {s && s.level !== "noise" && <span className="opacity-70">· {s.ratio.toFixed(1)}×</span>}
      </Badge>
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

/** Big-number tile. */
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  const color = tone ? { good: "text-good", bad: "text-bad", warn: "text-warn", noise: "text-noise", accent: "text-accent" }[tone] : "";
  return (
    <div className="rounded-xl bg-surface-2/70 px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`font-display mt-0.5 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
