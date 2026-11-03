import type { ShownNotification } from './notification'

/** What this needs from the worker's registration (small, so tests can pass a fake tray). */
type Tray = {
  getNotifications: () => Promise<readonly Pick<Notification, 'tag' | 'close'>[]>
  showNotification: (title: string, options?: NotificationOptions) => Promise<void>
}

/** Closes a reminder's notifications. Best effort: if they can't be listed, they stay. */
export async function closeAllOf(tray: Pick<Tray, 'getNotifications'>, tag: string) {
  try {
    for (const shown of await tray.getNotifications()) if (shown.tag === tag) shown.close()
  } catch {
    // Can't list them here: the next nag or the app closes them.
  }
}

/**
 * Shows a push's notification, and only the newest one per reminder: its older nags are closed
 * first. Chrome already replaces a notification with the same tag, but iPhone Safari keeps them
 * all (WebKit bug 258922), so a night of missed nags left 12 copies there (design doc decision 59).
 * Closed before showing: once Safari "replaces" one, it drops it from getNotifications() while it
 * stays on screen, and nothing can close it any more. All are listed and filtered here, because
 * other apps found Safari's tag filter unreliable. Closing is best effort; the new one always
 * shows (iOS requires a notification per push).
 */
export async function showOnlyNewest(tray: Tray, { title, options }: ShownNotification) {
  const { tag } = options
  if (tag) await closeAllOf(tray, tag)
  await tray.showNotification(title, options)
}
