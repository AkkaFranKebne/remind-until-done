import { Link } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'

/**
 * Which background the bar sits on. The Settings icon (and its focus ring) takes the
 * matching colour from the Design Inventory's phone screens.
 * - plain: the normal page background (settings, login, 404)
 * - brand: the violet list gradient
 * - nag-low / nag-mid / overdue / done: the reminder detail gradients
 */
export type TopBarTone = 'plain' | 'brand' | 'nag-low' | 'nag-mid' | 'overdue' | 'done'

const iconTone: Record<TopBarTone, string> = {
  plain: 'text-fg2',
  brand: 'text-on-grad',
  'nag-low': 'text-nag-low-fg',
  'nag-mid': 'text-nag-mid-fg',
  overdue: 'text-tag-overdue',
  done: 'text-tag-done-fg',
}

type TopBarProps = {
  tone?: TopBarTone
  /** Settings icon on the right. Hide it when nobody is signed in (login, offline, iOS gate). */
  showSettings?: boolean
  /** Optional state-based line under the bar, e.g. "3 things need your attention." */
  contextLine?: string
}

/**
 * The app header on every screen: logo left, Settings right, no background of its own
 * (it sits on the screen's background or gradient).
 * Design Inventory → Components → "TopBar + context line" and the Phone Screens.
 */
export function TopBar({ tone = 'plain', showSettings = true, contextLine }: TopBarProps) {
  const plain = tone === 'plain'
  return (
    <>
      <header className="pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center justify-between px-4">
          {/* On gradients: fixed violet, because the gradient's top stays light in dark mode too. */}
          <span
            className={[
              'text-xl font-bold tracking-[-0.02em]',
              plain ? 'text-accent' : 'text-on-grad',
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
                // The focus ring uses the icon's colour, so it's visible on every background.
                'focus-visible:outline-2 focus-visible:outline-current',
                iconTone[tone],
              ].join(' ')}
            >
              <SlidersHorizontal size={22} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </header>
      {/* Below the bar; it scrolls away with the content. */}
      {contextLine ? (
        <p
          className={[
            'px-4 pt-4 pb-3.5 text-[13px] italic',
            plain ? 'text-fg2' : 'text-on-grad-fg2',
          ].join(' ')}
        >
          {contextLine}
        </p>
      ) : null}
    </>
  )
}
