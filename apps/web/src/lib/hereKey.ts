/** Header the browser uses to pass a visitor's own HERE API key. */
export const USER_HERE_KEY_HEADER = "x-here-key";

/**
 * Prefer the visitor's own HERE key (sent from their browser), and fall back
 * to the server key if one is configured. The key is only forwarded to HERE.
 * It is never logged or stored.
 */
export function resolveHereKey(req: Request): string | undefined {
  const userKey = req.headers.get(USER_HERE_KEY_HEADER)?.trim();
  if (userKey) return userKey;
  return process.env.HERE_API_KEY || undefined;
}
