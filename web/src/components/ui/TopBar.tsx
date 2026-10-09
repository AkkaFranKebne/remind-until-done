import { Link } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'

type TopBarProps = {
  /**
   * surface: white bar with a bottom border.
   * transparent: no background, for screens with a gradient (list, reminder detail).
   */
  variant?: 'surface' | 'transparent'
  /** Settings icon on the right. Hide it when nobody is signed in (login, offline, iOS gate). */
  showSettings?: boolean
  /** Optional state-based line under the bar, e.g. "3 things need your attention." */
  contextLine?: string
}

/** The app header on every screen. Design Inventory → Components → "TopBar + context line". */
export function TopBar({ variant = 'surface', showSettings = true, contextLine }: TopBarProps) {
  const surface = variant === 'surface'
  return (
    <>
      <header
        className={[
          'pt-[env(safe-area-inset-top)]',
          // Only the solid bar sticks: content scrolling under a transparent bar would overlap the logo.
          surface ? 'sticky top-0 z-10 border-b border-border bg-bg2' : 'bg-transparent',
        ].join(' ')}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <span
            className={[
              'text-xl font-bold tracking-[-0.02em]',
              surface ? 'text-accent' : 'text-on-grad',
            ].join(' ')}
          >
            rud.
          </span>
          {showSettings ? (
            <Link
              to="/settings"
              aria-label="Settings"
              className={[
                '-mr-2.5 flex size-11 items-center justify-center rounded-xl',
                'focus-visible:outline-2',
                // Over a gradient: fixed colours (icon and focus ring), because the gradient's top stays light in dark mode too.
                surface
                  ? 'text-fg2 focus-visible:outline-accent'
                  : 'text-on-grad focus-visible:outline-on-grad',
              ].join(' ')}
            >
              <SlidersHorizontal size={22} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </header>
      {/* Below the bar, on the page background; it scrolls away with the content. */}
      {contextLine ? (
        <p
          className={[
            'px-4 pt-4 pb-3.5 text-[13px] italic',
            surface ? 'text-fg2' : 'text-on-grad-fg2',
          ].join(' ')}
        >
          {contextLine}
        </p>
      ) : null}
    </>
  )
}
