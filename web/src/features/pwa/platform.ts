/**
 * What the browser can tell us about the device (design doc §0 "Detection logic"). Pure
 * functions where possible, so Jest can test them with any user agent.
 */

/** iOS web push needs 16.4 (design doc §0): older iPhones get a hard stop. */
export const MIN_IOS: readonly [number, number] = [16, 4]

export type Ios = {
  device: 'iPhone' | 'iPad'
  /** e.g. [15, 7] or [17, 0, 1]; null if the user agent doesn't say. */
  version: number[] | null
}

/**
 * iPhone or iPad, and its iOS version, from the user agent; null for anything else.
 * iPads ask for desktop sites by default and say "Macintosh": a Mac with a touch screen is an iPad
 * (no Mac has one), and its Safari version ("Version/16.4") follows the iOS version.
 */
export function readIos(userAgent: string, maxTouchPoints: number): Ios | null {
  const mobile = /\b(iPhone|iPad|iPod)\b.*? OS (\d+)_(\d+)(?:_(\d+))?/.exec(userAgent)
  if (mobile) {
    return {
      device: mobile[1] === 'iPad' ? 'iPad' : 'iPhone',
      version: mobile.slice(2).filter(Boolean).map(Number),
    }
  }
  if (/\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1) {
    const safari = /\bVersion\/(\d+)\.(\d+)(?:\.(\d+))?/.exec(userAgent)
    return { device: 'iPad', version: safari ? safari.slice(1).filter(Boolean).map(Number) : null }
  }
  return null
}

/** Older than MIN_IOS. An unknown version gets the benefit of the doubt. */
export function isTooOld(ios: Ios): boolean {
  if (!ios.version) return false
  const [major = 0, minor = 0] = ios.version
  return major < MIN_IOS[0] || (major === MIN_IOS[0] && minor < MIN_IOS[1])
}

/**
 * On a Mac, the browser whose name macOS lists under System Settings → Notifications: Chrome or
 * Edge (they show the installed app's pushes under their own name). Null for anything else,
 * including an iPad that says "Macintosh" (it has a touch screen), Safari and Opera (it also says
 * "Chrome/", but macOS lists it as Opera).
 */
export function macBrowser(
  userAgent: string,
  maxTouchPoints: number,
): 'Google Chrome' | 'Microsoft Edge' | null {
  if (!/\bMacintosh\b/.test(userAgent) || maxTouchPoints > 1) return null
  if (/\bOPR\//.test(userAgent)) return null
  if (/\bEdg\//.test(userAgent)) return 'Microsoft Edge'
  return /\bChrome\//.test(userAgent) ? 'Google Chrome' : null
}

const STANDALONE = '(display-mode: standalone)'

/** Opened from the home screen icon (the installed app), not in a browser tab. */
export function isStandalone(): boolean {
  // matchMedia: every browser; navigator.standalone: older iOS Safari only.
  return (
    window.matchMedia?.(STANDALONE).matches ||
    ('standalone' in navigator && navigator.standalone === true)
  )
}

/**
 * For useSyncExternalStore: tells when isStandalone() may have changed. Desktop Chrome moves the
 * tab that installed rud. into the app's own window, so the same page becomes the app.
 */
export function subscribeStandalone(onChange: () => void) {
  const query = window.matchMedia?.(STANDALONE)
  query?.addEventListener?.('change', onChange)
  return () => query?.removeEventListener?.('change', onChange)
}

/**
 * A form sheet focuses its first field only once it has slid in (Sheet's focusAfterSlideIn): on
 * touch screens other than iPhone and iPad. Android Chrome opens the keyboard at once and scrolls
 * to the field while it's still sliding up from below, which pushes the sheet above the screen.
 * iPhone Safari opens the keyboard only for a focus straight from the tap, so it keeps that.
 */
export function focusesAfterSlideIn(ios: Ios | null, touchScreen: boolean): boolean {
  return touchScreen && ios === null
}

/** focusesAfterSlideIn for this device. */
export function waitsForSlideIn(): boolean {
  const touchScreen = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return focusesAfterSlideIn(readIos(navigator.userAgent, navigator.maxTouchPoints), touchScreen)
}
