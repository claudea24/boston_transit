"use client";

import { useEffect, useRef, useState } from "react";
import { useLocationContext } from "@/context/LocationContext";

export default function LocationSwitcher() {
  const { locations, currentLocation, selectLocation, removeLocation, setDefaultLocation } =
    useLocationContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (locations.length === 0) {
    return (
      <span className="text-sm text-white/60">No saved locations yet</span>
    );
  }

  const label = currentLocation?.name ?? "Select location";

  return (
    <div ref={ref} className="relative">
      <button
        className="glass-card-subtle px-4 py-1.5 rounded-full text-sm flex items-center gap-2 hover:bg-white/10 transition"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>📍</span>
        <span className="max-w-[220px] truncate">{label}</span>
        <span className="text-white/50 text-xs">▼</span>
      </button>

      {open && (
        <div
          className="absolute left-1/2 -translate-x-1/2 mt-2 w-72 glass-card p-1 z-30"
          role="listbox"
        >
          {locations.map((loc) => {
            const selected = loc.id === currentLocation?.id;
            return (
              <div
                key={loc.id}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg cursor-pointer ${
                  selected ? "bg-white/10" : "hover:bg-white/5"
                }`}
                onClick={() => {
                  selectLocation(loc.id);
                  setOpen(false);
                }}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm">{loc.name}</div>
                  <div className="truncate text-xs text-white/50">
                    {loc.country}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <button
                    title={loc.isDefault ? "Default location" : "Make default"}
                    className={`px-1.5 py-0.5 rounded ${
                      loc.isDefault ? "text-yellow-300" : "text-white/40 hover:text-white"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!loc.isDefault) setDefaultLocation(loc.id);
                    }}
                  >
                    ★
                  </button>
                  <button
                    title="Remove"
                    className="px-1.5 py-0.5 rounded text-white/40 hover:text-red-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeLocation(loc.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
