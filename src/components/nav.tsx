"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon, type IconName } from "./icons";

type NavLink = { href: string; label: string; short?: string; icon: IconName; hint: string };

export const LINKS: NavLink[] = [
  { href: "/scan", label: "Scan", icon: "scan", hint: "Calibrate, weekly check-in or breakout scan" },
  { href: "/progress", label: "Progress", icon: "progress", hint: "Every concern against your noise band" },
  { href: "/shelf", label: "Shelf", icon: "shelf", hint: "Products, clashes and your AM/PM routine" },
  { href: "/check", label: "Before you buy", short: "Check", icon: "check", hint: "Buy / skip for your skin and shelf" },
  { href: "/trials", label: "Trials", icon: "trials", hint: "28-day single-product experiments" },
  { href: "/coach", label: "Coach", icon: "coach", hint: "AI agent over your own data" },
  { href: "/compare", label: "Compare", icon: "compare", hint: "Before / after slider with zone maps" },
  { href: "/breakout", label: "Breakout", icon: "breakout", hint: "Triage a flare-up with your diary" },
  { href: "/evidence", label: "Evidence", icon: "evidence", hint: "Test the method yourself" },
  { href: "/brand", label: "For brands", icon: "brand", hint: "Verified Results, aggregated" },
  { href: "/report", label: "Dermatologist report", short: "Report", icon: "report", hint: "Printable summary" },
  { href: "/privacy", label: "Privacy & safety", short: "Privacy", icon: "shield", hint: "What is stored and why" },
];
const PRIMARY = ["/scan", "/progress", "/shelf", "/check", "/trials", "/coach"];
const MOBILE = ["/", "/scan", "/progress", "/coach"];

type Me = { user: { isDemo: boolean; timeShiftDays: number }; system: { youcamMock: boolean; ai: boolean } };

export function Nav() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [sheet, setSheet] = useState(false);
  const [more, setMore] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch("/api/me", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then(setMe)
        .catch(() => {});
    load();
    window.addEventListener("skinproof:time-travel", load);
    window.addEventListener("skinproof:me", load);
    return () => {
      window.removeEventListener("skinproof:time-travel", load);
      window.removeEventListener("skinproof:me", load);
    };
  }, [pathname]);

  // Close menus on navigation (state adjusted during render, not in an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setSheet(false);
    setMore(false);
    setPalette(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
      if (e.key === "Escape") {
        setPalette(false);
        setSheet(false);
        setMore(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const secondary = LINKS.filter((l) => !PRIMARY.includes(l.href));

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/75 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Logo />
          <nav className="hidden flex-1 items-center gap-0.5 lg:flex" aria-label="Main">
            {LINKS.filter((l) => PRIMARY.includes(l.href)).map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition ${active(l.href) ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:bg-surface/60 hover:text-ink"}`}
              >
                <Icon name={l.icon} className="size-4" />
                {l.short ?? l.label}
              </Link>
            ))}
            <div className="relative">
              <button
                onClick={() => setMore((m) => !m)}
                aria-expanded={more}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm transition ${secondary.some((l) => active(l.href)) ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:bg-surface/60 hover:text-ink"}`}
              >
                More
                <svg viewBox="0 0 24 24" className={`size-3.5 transition ${more ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {more && (
                <>
                  <button aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setMore(false)} />
                  <div className="absolute left-0 top-full z-50 mt-2 w-80 animate-rise rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
                    {secondary.map((l) => (
                      <MenuItem key={l.href} link={l} active={active(l.href)} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <StatusPills me={me} />
            <button
              onClick={() => setPalette(true)}
              className="hidden items-center gap-2 rounded-lg border border-line bg-surface/70 px-2.5 py-1.5 text-xs text-muted transition hover:text-ink sm:flex"
              aria-label="Search pages and actions"
            >
              <Icon name="search" className="size-3.5" />
              <kbd className="font-sans">⌘K</kbd>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Mobile tab bar: four destinations + a sheet with everything else. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden print:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {[{ href: "/", label: "Today", icon: "home" as IconName, hint: "" }, ...LINKS].filter((l) => MOBILE.includes(l.href)).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex flex-col items-center gap-1 py-2 text-[11px] ${active(l.href) ? "text-accent" : "text-muted"}`}
            >
              <Icon name={l.icon} className="size-5" />
              {l.label}
            </Link>
          ))}
          <button onClick={() => setSheet(true)} className={`flex flex-col items-center gap-1 py-2 text-[11px] ${sheet ? "text-accent" : "text-muted"}`}>
            <Icon name="more" className="size-5" />
            More
          </button>
        </div>
      </nav>

      {sheet && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal aria-label="All pages">
          <button aria-label="Close" className="absolute inset-0 animate-fade bg-black/40 backdrop-blur-sm" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] animate-sheet overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-lift">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <div className="grid grid-cols-1 gap-0.5">
              {LINKS.map((l) => (
                <MenuItem key={l.href} link={l} active={active(l.href)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </>
  );
}

function MenuItem({ link: l, active }: { link: NavLink; active: boolean }) {
  return (
    <Link href={l.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${active ? "bg-accent-soft/60" : "hover:bg-surface-2"}`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${active ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink"}`}>
        <Icon name={l.icon} className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{l.label}</span>
        <span className="block truncate text-xs text-muted">{l.hint}</span>
      </span>
    </Link>
  );
}

function StatusPills({ me }: { me: Me | null }) {
  if (!me) return null;
  return (
    <div className="flex items-center gap-1">
      {me.user.isDemo && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">Demo data</span>}
      {!!me.user.timeShiftDays && (
        <span title="Dates moved with developer time travel" className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">
          +{me.user.timeShiftDays}d
        </span>
      )}
      <span
        title={me.system.youcamMock ? "YouCam mock mode: simulated results, 0 units" : "Live YouCam AI Skin Analysis"}
        className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-flex ${me.system.youcamMock ? "bg-noise-soft text-noise" : "bg-accent-soft text-accent"}`}
      >
        <span className={`size-1.5 rounded-full ${me.system.youcamMock ? "bg-noise" : "animate-pulse bg-accent"}`} />
        {me.system.youcamMock ? "Mock AI" : "YouCam live"}
      </span>
    </div>
  );
}

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2 font-display text-lg font-semibold tracking-tight" aria-label="SkinProof home">
      <span className="relative grid size-7 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-accent to-accent-2 text-white shadow-card">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h3l2-5 4 10 2-5h7" />
        </svg>
      </span>
      <span>
        Skin<span className="text-accent">Proof</span>
      </span>
    </Link>
  );
}

const THEME_KEY = "skinproof:theme";
type ThemeChoice = "system" | "light" | "dark";

function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function readTheme(): ThemeChoice {
  try {
    const s = localStorage.getItem(THEME_KEY);
    return s === "light" || s === "dark" ? s : "system";
  } catch {
    return "system";
  }
}

function subscribeTheme(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onOs = () => {
    if (readTheme() === "system") applyTheme("system");
    cb();
  };
  mq.addEventListener("change", onOs);
  window.addEventListener("skinproof:theme", cb);
  window.addEventListener("storage", cb);
  return () => {
    mq.removeEventListener("change", onOs);
    window.removeEventListener("skinproof:theme", cb);
    window.removeEventListener("storage", cb);
  };
}

function ThemeToggle() {
  const choice = useSyncExternalStore(subscribeTheme, readTheme, () => null);

  function cycle() {
    const next: ThemeChoice = choice === "system" ? "light" : choice === "light" ? "dark" : "system";
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {}
    applyTheme(next);
    window.dispatchEvent(new Event("skinproof:theme"));
  }

  const icon: IconName = choice === "light" ? "sun" : choice === "dark" ? "moon" : "system";
  return (
    <button
      onClick={cycle}
      className="grid size-8 place-items-center rounded-lg border border-line bg-surface/70 text-muted transition hover:text-ink"
      aria-label={`Theme: ${choice ?? "system"}. Click to change.`}
      title={`Theme: ${choice ?? "system"}`}
    >
      <Icon name={icon} className="size-4" />
    </button>
  );
}

type Command = { id: string; label: string; hint: string; icon: IconName; run: () => void };

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const commands = useMemo<Command[]>(
    () => [
      { id: "home", label: "Today", hint: "Your dashboard", icon: "home", run: () => go("/") },
      ...LINKS.map((l) => ({ id: l.href, label: l.label, hint: l.hint, icon: l.icon, run: () => go(l.href) })),
      { id: "a-checkin", label: "Take a weekly check-in scan", hint: "Action", icon: "scan", run: () => go("/scan?type=checkin") },
      { id: "a-cal", label: "Re-calibrate my noise band", hint: "Action", icon: "sparkle", run: () => go("/scan?type=calibration") },
      { id: "a-routine", label: "Build my AM/PM routine", hint: "Action", icon: "routine", run: () => go("/shelf#routine") },
      { id: "a-improving", label: "Ask: is my skin actually improving?", hint: "Coach", icon: "coach", run: () => go(`/coach?q=${encodeURIComponent("Is my skin actually improving?")}`) },
      { id: "a-safe", label: "Ask: is my routine safe together?", hint: "Coach", icon: "coach", run: () => go(`/coach?q=${encodeURIComponent("Is my current routine safe to use together?")}`) },
    ],
    [go],
  );

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = commands.filter((c) => terms.every((t) => `${c.label} ${c.hint}`.toLowerCase().includes(t)));
  const current = Math.min(sel, Math.max(0, results.length - 1));

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal aria-label="Command palette">
      <button aria-label="Close" className="absolute inset-0 animate-fade bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg animate-rise overflow-hidden rounded-2xl border border-line bg-surface shadow-lift">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Icon name="search" className="size-4 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(results.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                results[current]?.run();
              }
            }}
            placeholder="Jump to a page or action…"
            className="h-12 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="rounded border border-line px-1.5 text-[10px] text-muted">esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matches.</li>}
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                onMouseEnter={() => setSel(i)}
                onClick={c.run}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${i === current ? "bg-accent-soft/60" : ""}`}
              >
                <Icon name={c.icon} className="size-4 text-accent" />
                <span className="flex-1 text-sm">{c.label}</span>
                <span className="text-xs text-muted">{c.hint.length > 28 ? "" : c.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Static header shown while the pathname-aware nav streams in. */
export function NavFallback() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
        <Logo />
      </div>
    </header>
  );
}
