import { useEffect, useState } from 'react'

/**
 * The current time, updated every minute: for things on screen that depend on it ("Today
 * 14:30", "Done 3h ago", the earliest pickable time). A clock is outside React, so an effect
 * keeps it in sync; reading new Date() during render would change on every redraw.
 */
export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}
