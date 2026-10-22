import { act } from '@testing-library/react'
import { resetRegisterOnStart } from '../features/notifications/useNotifications'
import { checkInstalledApp, clearInstallPrompt } from '../features/pwa/installPrompt'

/**
 * Pretend devices for the install gate (src/features/pwa). jsdom is a desktop browser tab with no
 * install offer ("unavailable"); these change that for one test. Call resetDevice() in afterEach.
 */

export const IPHONE_17 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
export const IPHONE_15_7 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1'

let displayMode: 'browser' | 'standalone' = 'browser'
const displayModeListeners = new Set<() => void>()

const fakeMatchMedia = (query: string) => ({
  media: query,
  get matches() {
    return query === '(display-mode: standalone)' && displayMode === 'standalone'
  },
  addEventListener: (_type: 'change', listener: () => void) => displayModeListeners.add(listener),
  removeEventListener: (_type: 'change', listener: () => void) =>
    displayModeListeners.delete(listener),
})

/**
 * A browser tab or the installed app's window. Changing it later works like desktop Chrome
 * moving the tab that installed rud. into the app's window: the page hears it and redraws.
 */
export function pretendDisplayMode(mode: 'browser' | 'standalone') {
  displayMode = mode
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: fakeMatchMedia })
  act(() => {
    for (const listener of displayModeListeners) listener()
  })
}

/** Opened from the home screen icon. */
export const pretendInstalled = () => pretendDisplayMode('standalone')

/** Another browser: e.g. an iPhone (IPHONE_17). maxTouchPoints > 1 = a touch screen. */
export function pretendUserAgent(userAgent: string, maxTouchPoints = 5) {
  // Own properties hide jsdom's (it has no maxTouchPoints at all); resetDevice() removes them.
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: userAgent })
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: maxTouchPoints })
}

/** Chrome offers to install (beforeinstallprompt); the person then picks `outcome`. */
export function offerInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    /** How many times the app opened Chrome's dialog. */
    prompted: 0,
    prompt: () => {
      event.prompted += 1
      return Promise.resolve()
    },
    userChoice: Promise.resolve({ outcome }),
  })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

/**
 * The browser answers "is rud. installed here?" (getInstalledRelatedApps): by default with one
 * app; pass [] for none, or an error for a browser that refuses to say.
 */
export async function pretendAppFound(answer: unknown[] | Error = [{ platform: 'webapp' }]) {
  Object.defineProperty(navigator, 'getInstalledRelatedApps', {
    configurable: true,
    value: () => (answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)),
  })
  await act(() => checkInstalledApp())
}

/**
 * The browser's notifications: `permission` now, and what the person answers when asked
 * (`answer`). `asked` counts the system prompts. jsdom has no notifications at all.
 */
export function pretendNotifications(
  permission: NotificationPermission,
  answer: NotificationPermission = 'granted',
) {
  const fake = {
    permission,
    asked: 0,
    requestPermission: () => {
      fake.asked += 1
      fake.permission = answer
      return Promise.resolve(answer)
    },
  }
  Object.defineProperty(window, 'Notification', { configurable: true, value: fake })
  return fake
}

/** This device registered before, as `id` (what the app keeps after POST /devices). */
export function pretendDeviceId(id: string) {
  localStorage.setItem('rud.deviceId', id)
}

export function resetDevice() {
  Reflect.deleteProperty(window, 'matchMedia')
  displayMode = 'browser'
  displayModeListeners.clear()
  Reflect.deleteProperty(navigator, 'userAgent')
  Reflect.deleteProperty(navigator, 'maxTouchPoints')
  Reflect.deleteProperty(navigator, 'getInstalledRelatedApps')
  Reflect.deleteProperty(window, 'Notification')
  localStorage.removeItem('rud.deviceId')
  localStorage.removeItem('rud.notifBannerLater')
  resetRegisterOnStart()
  act(() => clearInstallPrompt())
}
