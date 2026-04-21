"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GeocodingResult } from "@weather/shared";
import { useLocationContext } from "@/context/LocationContext";

export default function SearchPage() {
  const router = useRouter();
  const { addLocation, locations } = useLocationContext();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setResults(data.results ?? []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("search failed", err);
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [q]);

  const alreadySavedKey = (r: GeocodingResult) =>
    locations.some(
      (l) =>
        l.latitude.toFixed(2) === r.latitude.toFixed(2) &&
        l.longitude.toFixed(2) === r.longitude.toFixed(2)
    );

  async function onAdd(r: GeocodingResult) {
    const key = `${r.latitude},${r.longitude}`;
    setAdding(key);
    const created = await addLocation({
      name: r.admin1 ? `${r.name}, ${r.admin1}` : r.name,
      country: r.country,
      latitude: r.latitude,
      longitude: r.longitude,
    });
    setAdding(null);
    if (created) router.push("/");
  }

  return (
    <main className="pt-8 space-y-6">
      <h1 className="text-3xl font-semibold">Add a city</h1>

      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search for a city…"
        className="w-full glass-card-subtle px-5 py-3 outline-none focus:border-white/20"
      />

      {loading && <div className="text-white/50 text-sm">Searching…</div>}

      <ul className="space-y-2">
        {results.map((r) => {
          const key = `${r.latitude},${r.longitude}`;
          const saved = alreadySavedKey(r);
          return (
            <li
              key={key}
              className="glass-card px-4 py-3 flex items-center justify-between"
            >
              <div className="min-w-0">
                <div className="font-medium">
                  {r.name}
                  {r.admin1 ? `, ${r.admin1}` : ""}
                </div>
                <div className="text-sm text-white/50">{r.country}</div>
              </div>
              <button
                disabled={saved || adding === key}
                onClick={() => onAdd(r)}
                className={`px-3 py-1.5 rounded-full text-sm transition ${
                  saved
                    ? "bg-white/5 text-white/40 cursor-default"
                    : "bg-sky-500/80 hover:bg-sky-400 text-white"
                }`}
              >
                {saved ? "Saved" : adding === key ? "Adding…" : "Add"}
              </button>
            </li>
          );
        })}
      </ul>

      {!loading && q.trim().length >= 2 && results.length === 0 && (
        <div className="text-white/50 text-sm">No matches.</div>
      )}
    </main>
  );
}
