/**
 * Where to go after sign-in: /login?next=/r/123 (design doc 5.1).
 *
 * Only paths inside this app are allowed. Otherwise a link like
 * /login?next=//evil.example would send people to another site right after they
 * signed in ("open redirect"). Browsers read "//host" and "/\host" as other sites.
 */
export function safeNext(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return undefined
  // No control characters (tabs, line breaks): browsers strip them, which can turn "/\t/x" into "//x".
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return undefined
  }
  // Never back to the login page itself (no /login?next=/login?next=... loops).
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login/'))
    return undefined
  return value
}
