/**
 * The browser's notification permission, for useSyncExternalStore. It changes when you answer
 * the prompt, and when you change it in the phone's or browser's settings: Permissions API events
 * where there are any, and a fresh look whenever the app comes back to the screen.
 */

/** "default" = not asked yet. "unsupported" = no notifications in this browser. */
export type Permission = NotificationPermission | 'unsupported'

export const getPermission = (): Permission =>
  'Notification' in window ? Notification.permission : 'unsupported'

export function subscribePermission(onChange: () => void) {
  let status: PermissionStatus | undefined
  let stopped = false
  navigator.permissions
    ?.query({ name: 'notifications' })
    .then((s) => {
      if (stopped) return
      status = s
      s.addEventListener('change', onChange)
    })
    .catch(() => {}) // not every browser can be asked about notifications
  document.addEventListener('visibilitychange', onChange)
  return () => {
    stopped = true
    status?.removeEventListener('change', onChange)
    document.removeEventListener('visibilitychange', onChange)
  }
}

/** The system prompt. Must start from a tap (iPhone: only in the installed app). */
export const askPermission = (): Promise<NotificationPermission> =>
  'Notification' in window ? Notification.requestPermission() : Promise.resolve('denied')
