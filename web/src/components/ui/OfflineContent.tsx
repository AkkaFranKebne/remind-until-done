import { onlineManager, useMutation } from '@tanstack/react-query'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { serverReachable } from '../../lib/online'
import { Button } from './Button'

/** While this shows, how often to look for the connection coming back. */
const RECHECK_MS = 15_000
/**
 * The least time Try again spins. In flight mode Android fails the check at once, so the spinner
 * only blinked and the tap looked like it did nothing.
 */
const MIN_BUSY_MS = 1000

/** The message itself. Design Inventory → Phone Screens → "Offline — no cache". */
export function OfflineMessage({
  checking = false,
  onTryAgain,
}: {
  /** The user tapped Try again and we're waiting for the answer. */
  checking?: boolean
  onTryAgain: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  // Read while rendering: once the page below is hidden, the browser drops its focus.
  const before = useRef(document.activeElement)
  // The same for the scroll position: the hidden page has no height.
  const scrolled = useRef(window.scrollY)

  // Move focus here, so a screen reader says what happened, and put it and the scroll position back
  // afterwards. Not out of an open sheet: that stays usable over this message.
  useEffect(() => {
    const previous = before.current
    const top = scrolled.current
    const inSheet = previous?.closest('[role="dialog"], [role="alertdialog"]')
    if (!inSheet) heading.current?.focus()
    return () => {
      if (!inSheet && previous instanceof HTMLElement && previous.isConnected) {
        previous.focus({ preventScroll: true })
      }
      window.scrollTo(0, top)
    }
  }, [])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-3 text-center">
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-md bg-bg3 text-fg3"
      >
        <WifiOff size={24} strokeWidth={1.75} />
      </span>
      <h1 ref={heading} tabIndex={-1} className="text-lg font-bold text-balance outline-none">
        You&apos;re completely offline.
      </h1>
      <p className="text-sm text-balance text-fg2">
        No connection, no cache, no rud. Even we can&apos;t nag you without the internet.
      </p>
      <Button
        variant="ghost"
        size="lg"
        icon={RefreshCw}
        className="mt-2 w-full max-w-sm"
        loading={checking}
        onClick={onTryAgain}
      >
        Try again
      </Button>
    </div>
  )
}

/**
 * The offline message in place of a page's content (design doc 5.3). It goes away by itself: when
 * the browser says we're back, or when the server answers one of the checks here. navigator.onLine
 * can be wrong in both directions, so the browser alone isn't enough. The checks run quietly; only
 * a tap on Try again shows as busy. networkMode 'always': the one job that must run while offline.
 */
export function OfflineContent({ onBack }: { onBack?: () => void }) {
  // Kept in a ref so the checks always call the newest one, without restarting the timer.
  const back = useRef(onBack)
  useEffect(() => {
    back.current = onBack
  }, [onBack])
  const check = useRef(async () => {
    if (!(await serverReachable())) return
    onlineManager.setOnline(true)
    back.current?.()
  })
  const tap = useMutation({
    mutationFn: () =>
      Promise.all([
        check.current(),
        new Promise((resolve) => window.setTimeout(resolve, MIN_BUSY_MS)),
      ]),
    networkMode: 'always',
  })

  useEffect(() => {
    void check.current() // at once: one failed request may have been a blip
    const timer = window.setInterval(() => void check.current(), RECHECK_MS)
    const stop = onlineManager.subscribe((online) => {
      if (online) back.current?.()
    })
    return () => {
      window.clearInterval(timer)
      stop()
    }
  }, [])

  return <OfflineMessage checking={tap.isPending} onTryAgain={() => tap.mutate()} />
}
