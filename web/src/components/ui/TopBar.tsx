import { Link } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'
import { IconLink } from './IconButton'

/**
 * Which background the bar sits on. The Settings icon (and its focus ring) takes the
 * matching colour from the Design Inventory's phone screens.
 * - plain: the normal page background (settings, login, 404)
 * - brand: the violet list gradient
 * - nag-mid: the nagging reminder detail gradient
 * More tones (nag-low, overdue, done) come with the M2 detail screens: on those vivid
 * gradients today's colours fail contrast, so their look is decided there.
 */
export type TopBarTone = 'plain' | 'brand' | 'nag-mid'

const iconTone: Record<TopBarTone, string> = {
  plain: 'text-fg2',
  brand: 'text-on-grad',
  'nag-mid': 'text-nag-mid-fg',
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
          {/* The logo goes to the reminders list. 44px tall, so it's an easy tap. */}
          <Link
            to="/"
            aria-label="rud. – your reminders"
            className={[
              '-ml-1 flex min-h-11 items-center rounded-sm px-1 text-xl font-bold tracking-tight',
              'focus-visible:outline-2 focus-visible:outline-current',
              plain ? 'text-accent' : 'text-on-grad',
            ].join(' ')}
          >
            rud.
          </Link>
          {showSettings ? (
            <IconLink
              to="/settings"
              icon={SlidersHorizontal}
              label="Settings"
              className={`-mr-2 ${iconTone[tone]}`}
            />
          ) : null}
        </div>
      </header>
      {/* Below the bar; it scrolls away with the content. */}
      {contextLine ? (
        <p
          className={[
            'px-4 pt-4 pb-3.5 text-sm italic',
            plain ? 'text-fg2' : 'text-on-grad-fg2',
          ].join(' ')}
        >
          {contextLine}
        </p>
      ) : null}
    </>
  )
}
