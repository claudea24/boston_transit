"use client";

/** The visitor's own HERE API key, saved only in this browser's localStorage. */
const STORAGE_KEY = "transit_here_api_key";
export const HERE_KEY_CHANGED_EVENT = "transit-here-key-changed";

export function getUserHereKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setUserHereKey(key: string) {
  try {
    if (key.trim()) localStorage.setItem(STORAGE_KEY, key.trim());
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(HERE_KEY_CHANGED_EVENT));
}

/** Headers with the visitor's HERE key attached (if they saved one). */
export function withHereKey(headers: Record<string, string> = {}): Record<string, string> {
  const key = getUserHereKey();
  return key ? { ...headers, "x-here-key": key } : headers;
}
