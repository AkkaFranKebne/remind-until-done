import { Link } from '@tanstack/react-router'
import { cva } from 'class-variance-authority'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '../../lib/cn'
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

const iconTone = cva('-mr-2', {
  variants: {
    tone: {
      plain: 'text-fg2',
      brand: 'text-on-grad',
      'nag-mid': 'text-on-detail-nag-mid',
    } satisfies Record<TopBarTone, string>,
  },
})

type TopBarProps = {
  tone?: TopBarTone
  /** Settings icon on the right. Hide it when nobody is signed in (login, offline, iOS gate). */
  showSettings?: boolean
  /** Optional state-based line under the bar, e.g. "3 things need your attention." */
  contextLine?: string
}

/** The logo and context line: on-grad follows the list gradient (light violet in dark mode); the
 * detail gradients stay light in both themes, so they keep the fixed violet (accent-solid). */
const brandText = {
  plain: 'text-accent',
  brand: 'text-on-grad',
  'nag-mid': 'text-accent-solid',
} satisfies Record<TopBarTone, string>

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
          {/* The logo goes to the reminders list. 44px tall, so it's an easy tap. */}
          <Link
            to="/"
            aria-label="rud. – your reminders"
            className={cn(
              '-ml-1 flex min-h-11 items-center rounded-sm px-1 text-xl font-bold tracking-tight',
              'focus-visible:outline-2 focus-visible:outline-current',
              brandText[tone],
            )}
          >
            rud.
          </Link>
          {showSettings ? (
            <IconLink
              to="/settings"
              icon={SlidersHorizontal}
              label="Settings"
              className={iconTone({ tone })}
            />
          ) : null}
        </div>
      </header>
      {/* Below the bar; it scrolls away with the content. */}
      {contextLine ? (
        <p
          // Right under the logo, upright, in the logo's colour (brandText).
          className={cn('px-4 pt-1 pb-1 text-sm', plain ? 'text-fg2' : brandText[tone])}
        >
          {contextLine}
        </p>
      ) : null}
    </>
  )
}
