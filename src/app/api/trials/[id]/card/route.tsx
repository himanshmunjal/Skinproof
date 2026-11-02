import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { handle, notFound } from "@/lib/http/handle";
import { CONCERN_LABELS } from "@/lib/youcam/concerns";
import { getTrial } from "@/lib/services/trials";
import { currentUser } from "@/lib/services/users";

/**
 * Shareable "proof card" for a trial (DECISION D-43): a 1200×630 PNG with the measured result, rendered on the
 * server with next/og. Owner-only like every other route; it contains no photo and no personal data, so the
 * user decides where it goes.
 */

const VERDICT: Record<string, { text: string; color: string }> = {
  working: { text: "It's working", color: "#15803d" },
  no_change: { text: "No measurable change", color: "#b45309" },
  worsening: { text: "Made things worse", color: "#b42318" },
  too_early: { text: "Too early to tell", color: "#6b635c" },
  insufficient_data: { text: "Waiting for a check-in", color: "#6b635c" },
};

// The app's own typefaces (OFL), shipped as TTF because satori can't read woff2. Loaded once per server.
let fontsPromise: Promise<{ name: string; data: Buffer; weight: 400 | 600; style: "normal" }[]> | null = null;
function fonts() {
  const dir = path.join(process.cwd(), "src/assets/fonts");
  fontsPromise ??= Promise.all([
    readFile(path.join(dir, "Geist-Regular.ttf")).then((data) => ({ name: "Geist", data, weight: 400 as const, style: "normal" as const })),
    readFile(path.join(dir, "Geist-SemiBold.ttf")).then((data) => ({ name: "Geist", data, weight: 600 as const, style: "normal" as const })),
    readFile(path.join(dir, "Fraunces-SemiBold.ttf")).then((data) => ({ name: "Fraunces", data, weight: 600 as const, style: "normal" as const })),
  ]).catch((err) => {
    fontsPromise = null;
    throw err;
  });
  return fontsPromise;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/trials/[id]/card">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const trial = await getTrial((await currentUser()).id, id);
    if (!trial) return notFound();
    const v = VERDICT[trial.verdict.status] ?? VERDICT.too_early;
    const rows = trial.verdict.perConcern.slice(0, 4);
    const label = (c: string) => (CONCERN_LABELS as Record<string, string>)[c] ?? c;
    const day = Math.min(28, trial.verdict.day);

    const fontData = await fonts().catch(() => undefined); // fall back to the built-in font rather than failing
    const serif = fontData ? "Fraunces" : "sans-serif";

    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", background: "#f7f3ee", padding: 56, fontFamily: fontData ? "Geist" : "sans-serif", color: "#1c1917" }}>
          <div
            style={{
              position: "absolute",
              top: -180,
              right: -120,
              width: 620,
              height: 620,
              borderRadius: 620,
              background: "radial-gradient(circle, rgba(20,184,166,0.35), rgba(20,184,166,0))",
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -220,
              left: -160,
              width: 600,
              height: 600,
              borderRadius: 600,
              background: "radial-gradient(circle, rgba(225,29,116,0.22), rgba(225,29,116,0))",
              display: "flex",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", width: 520, justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "linear-gradient(135deg, #0f766e, #e11d74)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12h3l2-5 4 10 2-5h7" />
                  </svg>
                </div>
                <div style={{ fontSize: 30, fontWeight: 600, fontFamily: serif, display: "flex" }}>
                  Skin<span style={{ color: "#0f766e" }}>Proof</span>
                </div>
                <div style={{ marginLeft: 8, fontSize: 18, padding: "4px 12px", borderRadius: 999, background: "#d5f0eb", color: "#0f766e", display: "flex" }}>
                  Verified Result
                </div>
              </div>
              <div style={{ marginTop: 44, fontSize: 22, color: "#6b635c", display: "flex" }}>
                {trial.product?.brand ? `${trial.product.brand} · ` : ""}28-day single-product trial
              </div>
              <div style={{ marginTop: 8, fontSize: 46, fontWeight: 600, lineHeight: 1.1, letterSpacing: -1, display: "flex" }}>{trial.product?.name ?? "Product"}</div>
              <div style={{ marginTop: 28, fontSize: 60, fontWeight: 600, fontFamily: serif, lineHeight: 1.05, color: v.color, display: "flex" }}>{v.text}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", fontSize: 17, color: "#6b635c" }}>
              <div style={{ display: "flex" }}>Day {day} of 28 · measured against a personal noise band</div>
              <div style={{ display: "flex", marginTop: 4 }}>Measured with YouCam AI Skin Analysis</div>
            </div>
          </div>

          <div
            style={{
              marginLeft: "auto",
              width: 520,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 22,
              background: "rgba(255,255,255,0.85)",
              borderRadius: 32,
              padding: 40,
              border: "1px solid #e6dfd7",
            }}
          >
            {rows.length === 0 && <div style={{ fontSize: 26, color: "#6b635c", display: "flex" }}>No check-in scans yet.</div>}
            {rows.map((r) => {
              const ratio = Math.abs(r.delta) / (r.threshold || 1);
              const color = r.label === "improved" ? "#15803d" : r.label === "worse" ? "#b42318" : "#8a817a";
              const pct = Math.max(4, Math.min(100, (ratio / 3) * 100));
              return (
                <div key={r.concern} style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontSize: 28, fontWeight: 600, display: "flex" }}>{label(r.concern)}</div>
                    <div style={{ fontSize: 26, fontWeight: 600, color, display: "flex" }}>
                      {r.delta >= 0 ? "+" : ""}
                      {r.delta.toFixed(1)}
                    </div>
                  </div>
                  <div style={{ marginTop: 10, height: 14, borderRadius: 14, background: "#f2ece5", display: "flex", position: "relative" }}>
                    <div style={{ position: "absolute", left: "33.3%", top: -4, bottom: -4, width: 2, background: "#8a817a", display: "flex" }} />
                    <div style={{ width: `${pct}%`, height: 14, borderRadius: 14, background: color, display: "flex" }} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 18, color: "#6b635c", display: "flex" }}>
                    {r.label === "within_noise" ? "within your noise band" : `${ratio.toFixed(1)}× your normal photo-to-photo wobble`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: fontData,
        headers: { "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="skinproof-result.png"` },
      },
    );
  });
}
