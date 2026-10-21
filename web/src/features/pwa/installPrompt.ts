/**
 * Chrome's install prompt (Android and desktop). Chrome fires `beforeinstallprompt` once, often
 * before React has drawn anything, so this module listens from the moment the app loads and keeps
 * the event until a button asks for it (useInstall). Safari has no such event.
 *
 * Chrome stops offering once rud. is installed, so a tab also asks whether the app is already on
 * this device (getInstalledRelatedApps: Chrome on Android, Chrome and Edge 140+ on desktop; it
 * needs `related_applications` in public/manifest.webmanifest). Other browsers can't tell.
 */

/** Chrome's event (not in TypeScript's DOM types yet). */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallPromptState = {
  /** Chrome offered to install: show our own Install button. */
  prompt: InstallPromptEvent | null
  /** Installed from this tab just now (it stays a tab: the app opens from the home screen). */
  installed: boolean
  /** The browser says rud. is already installed on this device (this page is a tab). */
  appFound: boolean
}

const initial: InstallPromptState = { prompt: null, installed: false, appFound: false }
let state = initial
const listeners = new Set<() => void>()

function set(next: InstallPromptState) {
  state = next
  for (const listener of listeners) listener()
}

const isPromptEvent = (event: Event): event is InstallPromptEvent =>
  'prompt' in event && typeof event.prompt === 'function'

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    if (!isPromptEvent(event)) return
    event.preventDefault() // Chrome's own mini-bar would compete with our button
    set({ ...state, prompt: event, installed: false })
  })
  // Also fires when installed from the browser's menu or address bar.
  window.addEventListener('appinstalled', () => set({ ...state, prompt: null, installed: true }))
  void checkInstalledApp()
}

declare global {
  interface Navigator {
    /** Chrome and Edge only (not in TypeScript's DOM types yet). */
    getInstalledRelatedApps?: () => Promise<unknown[]>
  }
}

/** Asks the browser whether rud. is installed on this device (runs once when the app loads). */
export async function checkInstalledApp() {
  if (typeof navigator.getInstalledRelatedApps !== 'function') return
  try {
    const apps = await navigator.getInstalledRelatedApps()
    if (apps.length > 0) set({ ...state, appFound: true })
  } catch {
    // Not allowed here (e.g. not HTTPS): same as a browser that can't tell.
  }
}

/** For useSyncExternalStore. */
export const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getState = () => state

/**
 * Shows Chrome's install dialog. The event works once: afterwards Chrome may offer a new one
 * (another beforeinstallprompt) if the person said no.
 */
export async function promptInstall() {
  const event = state.prompt
  if (!event) return
  let installed = false
  try {
    await event.prompt()
    installed = (await event.userChoice).outcome === 'accepted'
  } finally {
    // Used up either way. If Chrome refused it (an event works only once), drop it too, so the
    // page falls back to its sign-in line instead of a button that does nothing.
    if (state.prompt === event) set({ ...state, prompt: null, installed })
  }
}

/** Back to "Chrome hasn't offered anything" (tests start each case from here). */
export const clearInstallPrompt = () => set(initial)
