/**
 * Skin weather (DECISION D-44): today's UV and humidity → plain, deterministic advice tied to the actives on
 * the user's shelf and their weakest measured concerns. Weather comes from Open-Meteo in the browser; the
 * location never reaches our server.
 */

export type Weather = { uvMax: number; humidity: number; tempC: number };
export type WeatherTip = { tone: "good" | "warn" | "bad" | "accent"; title: string; body: string };

const PHOTOSENSITISING: Record<string, string> = { retinoid: "retinoid", aha: "AHA", bha: "BHA" };

export function uvLevel(uv: number): { label: string; tone: WeatherTip["tone"] } {
  if (uv >= 8) return { label: "Very high", tone: "bad" };
  if (uv >= 6) return { label: "High", tone: "warn" };
  if (uv >= 3) return { label: "Moderate", tone: "accent" };
  return { label: "Low", tone: "good" };
}

export function skinWeatherTips(w: Weather, shelfActives: string[], weakest: string[]): WeatherTip[] {
  const tips: WeatherTip[] = [];
  const sensitising = [...new Set(shelfActives.filter((a) => a in PHOTOSENSITISING).map((a) => PHOTOSENSITISING[a]))];
  const hasSpf = shelfActives.includes("sunscreen");

  if (w.uvMax >= 6) {
    tips.push({
      tone: w.uvMax >= 8 ? "bad" : "warn",
      title: `UV peaks at ${Math.round(w.uvMax)} today`,
      body:
        (hasSpf ? "Wear your SPF and reapply every 2 hours outdoors." : "You have no SPF on your shelf — today is the day to wear one (30+, broad spectrum).") +
        (sensitising.length ? ` Your ${sensitising.join(" and ")} make${sensitising.length === 1 ? "s" : ""} skin more sun-sensitive.` : ""),
    });
  } else if (w.uvMax >= 3) {
    tips.push({
      tone: "accent",
      title: `Moderate UV (${Math.round(w.uvMax)})`,
      body: hasSpf ? "Your morning SPF is enough for normal days out." : "A daily SPF 30+ protects whatever your trial is improving.",
    });
  }

  if (w.humidity < 35) {
    tips.push({
      tone: weakest.includes("moisture") ? "warn" : "accent",
      title: `Dry air (${Math.round(w.humidity)}% humidity)`,
      body:
        (weakest.includes("moisture") ? "Moisture is already one of your weakest scores. " : "") +
        "Apply hydrators to damp skin and seal with a moisturizer; ease off exfoliants tonight.",
    });
  } else if (w.humidity > 75) {
    tips.push({
      tone: "accent",
      title: `Humid (${Math.round(w.humidity)}%)`,
      body: weakest.includes("oiliness") || weakest.includes("pore") ? "Oil and pores are among your weak spots — a lighter gel moisturizer will feel better today." : "A lighter moisturizer is enough today.",
    });
  }

  if (w.tempC <= 5) {
    tips.push({ tone: "accent", title: `Cold (${Math.round(w.tempC)}°C)`, body: "Cold wind strips the barrier — a richer cream and less cleansing help redness and dryness." });
  }

  // Scans taken in very different light aren't comparable — this is the measurement-first reminder.
  if (w.uvMax >= 6) {
    tips.push({ tone: "good", title: "Scanning today?", body: "Scan indoors facing a window, not in direct sun, so the light matches your calibration." });
  }
  if (!tips.length) tips.push({ tone: "good", title: "Easy skin day", body: "Mild conditions — stick to your routine." });
  return tips;
}
