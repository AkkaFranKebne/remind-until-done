/// <reference lib="webworker" />
/**
 * The app's one service worker (design doc 5.8, decision 41), built by vite-plugin-pwa
 * ("injectManifest") into /sw.js. Two jobs:
 *
 * 1. The app shell, so the installed app opens even without a connection: every built file is
 *    cached at install time. Pages come from the network first (a deploy shows up on the next
 *    open, as decision 33 wants) and from the cache only when offline. /api and Firebase's own
 *    /__ pages (the Google sign-in round trip) always go to the network.
 * 2. Pushes: FCM delivers through the browser's standard Push API. Every push shows a
 *    notification (iOS requires one) and tells open app pages to refresh; a tap opens or
 *    focuses the app on the reminder. Its Done button tells the API directly (sw/click.ts).
 *    No Firebase in here: the page gets the push token with Firebase (M3 PR 4).
 */
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { handleClick } from './sw/click'
import { pushArrived } from './sw/messages'
import { toNotification } from './sw/notification'
import { closeAllOf, showOnlyNewest } from './sw/show'

declare const self: ServiceWorkerGlobalScope

// A new version takes over at once (no "close every tab first"); the page it controls keeps
// running until the next open, which then loads the new files.
void self.skipWaiting()
clientsClaim()

// Pages first (Workbox uses the first route that matches): otherwise the precache would answer
// "/" from the cache, and a deploy would only show up on the second open.
registerRoute(
  new NavigationRoute(
    async ({ request }) => {
      try {
        return await fetch(request)
      } catch {
        // Offline: the cached app, which shows its own "no connection" state.
        return (await matchPrecache('index.html')) ?? Response.error()
      }
    },
    { denylist: [/^\/api\//, /^\/__\//] },
  ),
)

cleanupOutdatedCaches()
// The build replaces self.__WB_MANIFEST with the list of files to cache (the exact name is
// required; .oxlintrc.json allows its underscores).
precacheAndRoute(self.__WB_MANIFEST)

// Firebase's web settings (public): network first, the last copy when offline, so the installed
// app opened offline still knows who is signed in (and says it's offline) instead of acting
// signed out. Only this file: the rest of /__ (the sign-in pages) always goes to the network.
const FIREBASE_SETTINGS = '/__/firebase/init.json'
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname === FIREBASE_SETTINGS,
  async ({ request }) => {
    const cache = await caches.open('firebase-settings')
    try {
      const fresh = await fetch(request)
      if (fresh.ok) await cache.put(FIREBASE_SETTINGS, fresh.clone())
      return fresh
    } catch {
      return (await cache.match(FIREBASE_SETTINGS)) ?? Response.error()
    }
  },
)

// Push listeners must be registered when the script first runs, or browsers may drop pushes.
self.addEventListener('push', (event) => {
  let payload: unknown
  try {
    payload = event.data?.json()
  } catch {
    payload = undefined // not JSON: still show something (iOS requires a notification)
  }
  const shown = toNotification(payload)
  event.waitUntil(
    Promise.all([showOnlyNewest(self.registration, shown), tellPages(shown.reminderId)]),
  )
})

/**
 * Open app pages refresh the reminder: a push, or Done from a notification, means it changed
 * (design doc 5.8). Best effort:
 * the notification matters, a page that just closed doesn't.
 */
async function tellPages(reminderId: string | undefined) {
  try {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const page of windows) page.postMessage(pushArrived(reminderId))
  } catch {
    // Nothing to tell: the pages reload the reminders when next opened or focused anyway.
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { data, tag } = event.notification
  event.waitUntil(
    handleClick(
      { action: event.action, data, tag },
      {
        open: openOrFocus,
        show: (shown) => showOnlyNewest(self.registration, shown),
        closeAll: (doneTag) => closeAllOf(self.registration, doneTag),
        tellPages,
        post: (url, init) => fetch(url, init),
      },
    ),
  )
})

/** Focus an open app window and show the page there, or open a new one. */
async function openOrFocus(path: string) {
  const url = new URL(path, self.location.origin).href
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const open = windows[0]
  if (open) {
    try {
      const focused = await open.focus()
      await focused.navigate(url)
      return
    } catch {
      // A window this worker doesn't control (e.g. opened before it installed) can't be
      // navigated from here: open the reminder in a new one instead.
    }
  }
  await self.clients.openWindow(url)
}
