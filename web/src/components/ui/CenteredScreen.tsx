import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** The middle area. Whoever has no header or footer keeps clear of the notch or home bar here. */
const mainArea = cva('flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center', {
  variants: {
    header: { true: 'pt-6', false: 'pt-[calc(1.5rem+env(safe-area-inset-top))]' },
    footer: { true: 'pb-6', false: 'pb-[calc(1.5rem+env(safe-area-inset-bottom))]' },
  },
})

/**
 * A whole screen whose content sits in the middle, top-to-bottom and left-to-right:
 * Login, Splash, the 404 page (and Offline and the iOS version gate later).
 * Keeps clear of the notch and home bar (safe areas). Pass `header` for a TopBar above
 * the content (it handles the top safe area itself); without one, this screen does.
 * Pass `footer` for a line at the bottom (the login page's Privacy link): it sits at the
 * bottom on a tall screen and follows the content on a short one, and takes over the home bar
 * safe area.
 * Design Inventory → Phone Screens → Login, Global overlays.
 */
export function CenteredScreen({
  header,
  footer,
  className,
  children,
}: {
  header?: ReactNode
  footer?: ReactNode
  /** Spacing between the items, e.g. "gap-3.5" (default gap-4). */
  className?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      {header}
      <main
        className={cn(mainArea({ header: Boolean(header), footer: Boolean(footer) }), className)}
      >
        {children}
      </main>
      {footer ? (
        <footer className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center">
          {footer}
        </footer>
      ) : null}
    </div>
  )
}
