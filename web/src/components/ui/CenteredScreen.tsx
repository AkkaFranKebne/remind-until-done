import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * A whole screen whose content sits in the middle, top-to-bottom and left-to-right:
 * Login, Splash, the 404 page (and Offline and the iOS version gate later).
 * Keeps clear of the notch and home bar (safe areas). Pass `header` for a TopBar above
 * the content (it handles the top safe area itself); without one, this screen does.
 * Design Inventory → Phone Screens → Login, Global overlays.
 */
export function CenteredScreen({
  header,
  className,
  children,
}: {
  header?: ReactNode
  /** Spacing between the items, e.g. "gap-3.5" (default gap-4). */
  className?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      {header}
      <main
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center',
          header ? 'pt-6' : 'pt-[calc(1.5rem+env(safe-area-inset-top))]',
          'pb-[calc(1.5rem+env(safe-area-inset-bottom))]',
          className,
        )}
      >
        {children}
      </main>
    </div>
  )
}
