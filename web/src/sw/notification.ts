/**
 * How a push becomes a notification (the service worker, src/sw.ts, shows it). Pure functions,
 * so Jest can test them without a service worker.
 *
 * FCM delivers through the browser's standard Push API (decision 41). The payload is FCM's JSON:
 * - our own pushes (M4) are data-only: `data` holds title, body, reminderId, url and sentAt
 *   (design doc 5.8: always data-only, and we always show a notification, because iOS requires
 *   one per push);
 * - a test message from the Firebase console has a `notification` with title and body instead.
 */

export type ShownNotification = {
  title: string
  // TypeScript's DOM types left out renotify and timestamp; browsers that know them use them.
  options: NotificationOptions & { renotify?: boolean; timestamp?: number }
  /** The reminder it's about, so open pages can refresh it (undefined: not a reminder's push). */
  reminderId?: string
}

// Any placeholder origin: only "is it still this origin after parsing?" matters.
const HERE = 'https://rud.invalid'

/**
 * The page a tap opens. Only paths inside the app (like /r/abc), never another site. Decided by
 * the parsed address, not the text: the URL parser drops tabs and newlines and reads "\\" as "/",
 * so "/\t/evil.example" or "/\\evil.example" would otherwise leave the app.
 */
export function safeAppPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/'
  const url = new URL(value, HERE)
  if (url.origin !== HERE) return '/'
  return url.pathname + url.search + url.hash
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

/** A push payload (anything: it comes from the network) → what to show. */
export function toNotification(payload: unknown): ShownNotification {
  const message = asRecord(payload)
  const data = asRecord(message.data)
  const fromConsole = asRecord(message.notification)
  const reminderId = text(data.reminderId)

  return {
    title: text(data.title) ?? text(fromConsole.title) ?? 'rud.',
    options: {
      body: text(data.body) ?? text(fromConsole.body) ?? '',
      icon: '/icon-192.png',
      badge: '/badge-96.png', // Android's status bar
      // One notification per reminder: a new nag replaces the last one and alerts again (iPhone
      // ignores the tag, so sw/show.ts closes the older ones first). On desktop it stays on
      // screen until clicked or closed (decision 54; iPhone ignores that too).
      ...(reminderId ? { tag: reminderId, renotify: true, requireInteraction: true } : {}),
      // When it was sent, not when it arrived: a nag delivered after the phone was off says so.
      ...timestampOf(data.sentAt),
      data: { url: safeAppPath(data.url ?? (reminderId ? `/r/${reminderId}` : '/')) },
    },
    ...(reminderId ? { reminderId } : {}),
  }
}

/** sentAt (an ISO time from the API) → the notification's timestamp; nothing if it's not a time. */
function timestampOf(sentAt: unknown): { timestamp?: number } {
  const ms = typeof sentAt === 'string' ? Date.parse(sentAt) : Number.NaN
  return Number.isFinite(ms) ? { timestamp: ms } : {}
}

/** The page a tapped notification should open (from its `data.url`). */
export function urlOf(notificationData: unknown): string {
  return safeAppPath(asRecord(notificationData).url)
}
