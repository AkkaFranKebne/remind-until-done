/**
 * How a push becomes a notification (the service worker, src/sw.ts, shows it). Pure functions,
 * so Jest can test them without a service worker.
 *
 * FCM delivers through the browser's standard Push API (decision 41). The payload is FCM's JSON:
 * - our own pushes (M4) are data-only: `data` holds title, body, reminderId, url, sentAt and doneToken
 *   (design doc 5.8: always data-only, and we always show a notification, because iOS requires
 *   one per push);
 * - a test message from the Firebase console has a `notification` with title and body instead.
 */

export type ShownNotification = {
  title: string
  // TypeScript's DOM types left out these three; browsers that know them use them.
  options: NotificationOptions & {
    renotify?: boolean
    timestamp?: number
    actions?: { action: string; title: string }[]
  }
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
  try {
    const url = new URL(value, HERE)
    // A path starting with "//" (from "/.//evil.example") would read as another site next time.
    if (url.origin !== HERE || url.pathname.startsWith('//')) return '/'
    return url.pathname + url.search + url.hash
  } catch {
    return '/' // not parseable, like "//["
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

/** The notification's buttons. sw/click.ts handles them; UX Copy is in the Inventory. */
const BUTTONS = [
  { action: 'done', title: 'Done' },
  { action: 'remind-later', title: 'Remind later' },
]

/** Tapping Done failed, and the phone has already closed the notification (decision 72). */
export function doneFailed(url: string, tag: string): ShownNotification {
  return {
    title: "Couldn't mark it done.",
    options: {
      body: 'Tap to open.',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      // The same tag: the next nag replaces this message.
      ...(tag ? { tag, renotify: true, requireInteraction: true } : {}),
      data: { url: safeAppPath(url) },
    },
  }
}

/** A push payload (anything: it comes from the network) → what to show. */
export function toNotification(payload: unknown): ShownNotification {
  const message = asRecord(payload)
  const data = asRecord(message.data)
  const fromConsole = asRecord(message.notification)
  const reminderId = text(data.reminderId)
  const doneToken = text(data.doneToken)

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
      // Buttons need the token. Browsers without buttons, like iPhone's, ignore them (decision 72).
      ...(doneToken ? { actions: BUTTONS } : {}),
      data: {
        url: safeAppPath(data.url ?? (reminderId ? `/r/${reminderId}` : '/')),
        ...(doneToken ? { doneToken } : {}),
      },
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
