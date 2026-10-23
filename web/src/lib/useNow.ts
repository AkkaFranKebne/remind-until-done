import { useEffect, useState } from 'react'

/**
 * The current time, updated on every whole minute: for things on screen that depend on it ("Today
 * 14:30", "Done 3h ago", the earliest pickable time). A clock is outside React, so an effect
 * keeps it in sync; reading new Date() during render would change on every redraw.
 */
export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Ticks on the clock's own boundary (every minute at :00, every second on the second), not
    // counted from when the page opened: "Today 15:00" turns into "Tomorrow 15:00" exactly at
    // 15:00:00, the moment the save would too (decision 49).
    const tick = () => setNow(new Date())
    let id: ReturnType<typeof setInterval> | undefined
    const first = setTimeout(
      () => {
        tick()
        id = setInterval(tick, everyMs)
      },
      everyMs - (Date.now() % everyMs),
    )
    // Back from the background (a phone pauses timers there): catch up at once.
    const onShow = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearTimeout(first)
      clearInterval(id)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [everyMs])
  return now
}
