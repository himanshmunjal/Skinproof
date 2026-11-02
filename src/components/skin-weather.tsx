"use client";

import { useCallback, useEffect, useState } from "react";
import { skinWeatherTips, uvLevel, type Weather } from "@/lib/domain/weather";
import { Icon } from "./icons";
import { Button, Card, Spinner } from "./ui";

const KEY = "skinproof:place";
type Place = { lat: number; lon: number; name: string };

async function fetchWeather(p: Place): Promise<Weather> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,relative_humidity_2m&daily=uv_index_max&timezone=auto&forecast_days=1`;
  const d = await (await fetch(url)).json();
  return { uvMax: d.daily.uv_index_max[0] ?? 0, humidity: d.current.relative_humidity_2m, tempC: d.current.temperature_2m };
}

/** Today's UV + humidity from Open-Meteo (free, keyless), fetched in the browser: the location never reaches our server. */
export function SkinWeather({ shelfActives, weakest }: { shelfActives: string[]; weakest: string[] }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState("");

  const load = useCallback(async (p: Place) => {
    setBusy(true);
    setError(null);
    try {
      setWeather(await fetchWeather(p));
      setPlace(p);
      try {
        localStorage.setItem(KEY, JSON.stringify(p));
      } catch {}
    } catch {
      setError("Couldn't load the weather right now.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Place | null;
      if (saved && typeof saved.lat === "number")
        fetchWeather(saved)
          .then((w) => {
            setWeather(w);
            setPlace(saved);
          })
          .catch(() => {});
    } catch {}
  }, []);

  function locate() {
    if (!navigator.geolocation) return setError("Location isn't available — search a city instead.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      // ~1 km precision is plenty for weather and keeps the stored location coarse.
      (pos) => void load({ lat: +pos.coords.latitude.toFixed(2), lon: +pos.coords.longitude.toFixed(2), name: "Your location" }),
      () => {
        setBusy(false);
        setError("Location was blocked — search a city instead.");
      },
      { timeout: 10000, maximumAge: 3_600_000 },
    );
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!city.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const d = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city.trim())}`)).json();
      const r = d.results?.[0];
      if (!r) throw new Error();
      await load({ lat: +r.latitude.toFixed(2), lon: +r.longitude.toFixed(2), name: [r.name, r.country_code].filter(Boolean).join(", ") });
    } catch {
      setBusy(false);
      setError("City not found.");
    }
  }

  const tips = weather ? skinWeatherTips(weather, shelfActives, weakest) : [];
  const uv = weather ? uvLevel(weather.uvMax) : null;
  const toneCls = { good: "text-good", warn: "text-warn", bad: "text-bad", accent: "text-accent" } as const;

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Skin weather</p>
          <p className="mt-1 text-sm text-muted">{place ? place.name : "UV and humidity, matched to your shelf"}</p>
        </div>
        {place && (
          <button onClick={() => setPlace(null)} className="text-xs text-muted hover:text-ink">
            Change
          </button>
        )}
      </div>

      {weather && place ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Metric icon="uv" value={weather.uvMax.toFixed(1)} label={`UV · ${uv!.label}`} cls={toneCls[uv!.tone]} />
            <Metric icon="drop" value={`${Math.round(weather.humidity)}%`} label="Humidity" />
            <Metric icon="sun" value={`${Math.round(weather.tempC)}°`} label="Now" />
          </div>
          <ul className="mt-3 space-y-2">
            {tips.slice(0, 3).map((t) => (
              <li key={t.title} className="text-sm">
                <span className={`font-medium ${toneCls[t.tone]}`}>{t.title}.</span> <span className="text-muted">{t.body}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-3 space-y-2">
          <Button variant="secondary" className="w-full" onClick={locate} disabled={busy}>
            {busy ? <Spinner /> : <Icon name="location" className="size-4" />} Use my location
          </Button>
          <form onSubmit={search} className="flex gap-2">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="…or type a city"
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <Button type="submit" variant="secondary" disabled={busy}>
              Go
            </Button>
          </form>
          <p className="text-[11px] text-muted">Weather by Open-Meteo. Your location stays in this browser.</p>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    </Card>
  );
}

function Metric({ icon, value, label, cls = "" }: { icon: "uv" | "drop" | "sun"; value: string; label: string; cls?: string }) {
  return (
    <div className="rounded-xl bg-surface-2/70 px-2.5 py-2">
      <Icon name={icon} className={`size-4 ${cls || "text-muted"}`} />
      <div className={`font-display mt-1 text-xl font-semibold tabular-nums ${cls}`}>{value}</div>
      <div className="truncate text-[11px] text-muted">{label}</div>
    </div>
  );
}
