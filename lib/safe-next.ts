/**
 * Only allow same-site relative paths in ?next=… redirects.
 * Blocks "//evil.com", "/\evil.com" and "https://…" (open-redirect).
 */
export function safeNext(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(raw)) return fallback;
  return raw;
}
