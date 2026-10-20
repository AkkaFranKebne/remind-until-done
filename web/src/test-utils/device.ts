import { act } from '@testing-library/react'
import { clearInstallPrompt } from '../features/pwa/installPrompt'

/**
 * Pretend devices for the install gate (src/features/pwa). jsdom is a desktop browser tab with no
 * install offer ("unavailable"); these change that for one test. Call resetDevice() in afterEach.
 */

export const IPHONE_17 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
export const IPHONE_15_7 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1'

/** Opened from the home screen icon. */
export function pretendInstalled() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: query === '(display-mode: standalone)', media: query }),
  })
}

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

export function resetDevice() {
  Reflect.deleteProperty(window, 'matchMedia')
  Reflect.deleteProperty(navigator, 'userAgent')
  Reflect.deleteProperty(navigator, 'maxTouchPoints')
  act(() => clearInstallPrompt())
}
