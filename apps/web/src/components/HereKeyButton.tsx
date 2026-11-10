"use client";

import { useEffect, useState } from "react";
import { getUserHereKey, setUserHereKey, HERE_KEY_CHANGED_EVENT } from "@/lib/userHereKey";

export default function HereKeyButton() {
  const [open, setOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const sync = () => setHasKey(!!getUserHereKey());
    sync();
    window.addEventListener(HERE_KEY_CHANGED_EVENT, sync);
    return () => window.removeEventListener(HERE_KEY_CHANGED_EVENT, sync);
  }, []);

  const save = () => {
    setUserHereKey(draft);
    setDraft("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="nav-button flex items-center gap-2"
        aria-expanded={open}
      >
        🔑 HERE key
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: hasKey ? "#34d399" : "#6b7280" }}
        />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-80 rounded-2xl p-4 z-50 shadow-xl"
          style={{ background: "#111827", color: "#e5e7eb", border: "1px solid #374151" }}
        >
          <p className="text-sm font-semibold mb-1">Use your own HERE API key</p>
          <p className="text-xs mb-3" style={{ color: "#9ca3af" }}>
            Enables precise place search and real transit routing (drawn along actual tracks and streets).
            Without it, the app shows estimated routes. The key is saved only in this browser and sent with
            search and trip requests. It is never stored on our servers. Get a free key at{" "}
            <a
              href="https://platform.here.com/admin/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "#5eead4" }}
            >
              platform.here.com
            </a>.
          </p>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && draft.trim() && save()}
            placeholder={hasKey ? "Key saved. Paste a new one to replace it" : "Paste your HERE API key"}
            autoComplete="off"
            className="w-full text-sm rounded-xl px-3 py-2 mb-3 outline-none"
            style={{ background: "#1f2937", border: "1px solid #374151", color: "#f9fafb" }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!draft.trim()}
              className="flex-1 text-sm font-medium rounded-xl py-2 disabled:opacity-40"
              style={{ background: "#14b8a6", color: "#042f2e" }}
            >
              Save key
            </button>
            {hasKey && (
              <button
                type="button"
                onClick={() => { setUserHereKey(""); setOpen(false); }}
                className="text-sm font-medium rounded-xl px-3 py-2"
                style={{ border: "1px solid #7f1d1d", color: "#fca5a5" }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
