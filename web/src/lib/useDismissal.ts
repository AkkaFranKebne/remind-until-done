import { useState } from 'react'

export const DAY_MS = 24 * 60 * 60 * 1000

function dismissedWithin(key: string, forMs: number): boolean {
  try {
    const at = Number(localStorage.getItem(key))
    return at > 0 && Date.now() - at < forMs
  } catch {
    return false
  }
}

/**
 * "Not now" for a banner: hidden for `forMs` after the tap, also across app starts
 * (localStorage keeps the time of the tap). Blocked storage: hidden until the page is shown again.
 */
export function useDismissal(
  key: string,
  forMs: number,
): [dismissed: boolean, dismiss: () => void] {
  const [dismissed, setDismissed] = useState(() => dismissedWithin(key, forMs))
  const dismiss = () => {
    try {
      localStorage.setItem(key, String(Date.now()))
    } catch {
      // Blocked storage: hidden for now only.
    }
    setDismissed(true)
  }
  return [dismissed, dismiss]
}
