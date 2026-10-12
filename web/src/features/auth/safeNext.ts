/**
 * Where to go after sign-in: /login?next=/r/123 (design doc 5.1).
 *
 * Only pages of this app are allowed. Otherwise a link like
 * /login?next=//evil.example would send people to another site right after they
 * signed in ("open redirect").
 *
 * Instead of listing tricks (//host, /\host, hidden tabs ...), we let the browser's own
 * URL parser read the value, exactly as it would when navigating, and check that the
 * result is still on our site.
 */
export function safeNext(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined

  const url = new URL(value, window.location.origin)
  if (url.origin !== window.location.origin) return undefined // another website
  if (url.pathname.toLowerCase() === '/login') return undefined // no /login?next=/login loops

  return url.pathname + url.search + url.hash
}
