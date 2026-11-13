import { isWhichWindow, windowKind } from '../../sw/messages'
import { isStandalone } from './platform'

/**
 * Answers the service worker's question "are you the installed app?" (sw/windows.ts), so a tap
 * on a notification opens the reminder in the app and not in a rud. tab that happens to be open.
 * Listens for the page's whole life, from start, so it answers before React has drawn anything.
 */
export function answerWhichWindow(installed: () => boolean = isStandalone) {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (!isWhichWindow(event.data)) return
    event.ports[0]?.postMessage(windowKind(installed()))
  })
}
