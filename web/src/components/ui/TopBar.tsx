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
 * - waiting … done: the reminder page's gradient for that state; the icon takes the state's
 *   text colour (the same token as the page's title and countdown, light and dark).
 */
export type TopBarTone =
  'plain' | 'brand' | 'waiting' | 'nag-low' | 'nag-mid' | 'nag-high' | 'overdue' | 'done'

const iconTone = cva('-mr-2', {
  variants: {
    tone: {
      plain: 'text-fg2',
      brand: 'text-on-grad',
      waiting: 'text-on-grad',
      'nag-low': 'text-nag-low-fg',
      'nag-mid': 'text-nag-mid-fg',
      'nag-high': 'text-tile-overdue-fg',
      overdue: 'text-tile-overdue-fg',
      done: 'text-tag-done-fg',
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

/** The logo and context line: violet on every gradient (on-grad: light violet in dark mode, where
 * the gradients are dark too). On the plain page the logo uses the accent, the line fg2. */
const brandText = cva('', {
  variants: {
    tone: {
      plain: '',
      brand: 'text-on-grad',
      waiting: 'text-on-grad',
      'nag-low': 'text-on-grad',
      'nag-mid': 'text-on-grad',
      'nag-high': 'text-on-grad',
      overdue: 'text-on-grad',
      done: 'text-on-grad',
    } satisfies Record<TopBarTone, string>,
    part: { logo: '', contextLine: '' },
  },
  compoundVariants: [
    { tone: 'plain', part: 'logo', class: 'text-accent' },
    { tone: 'plain', part: 'contextLine', class: 'text-fg2' },
  ],
})

/**
 * The app header on every screen: logo left, Settings right, no background of its own
 * (it sits on the screen's background or gradient).
 * Design Inventory → Components → "TopBar + context line" and the Phone Screens.
 */
export function TopBar({ tone = 'plain', showSettings = true, contextLine }: TopBarProps) {
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
              brandText({ tone, part: 'logo' }),
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
          className={cn('px-4 pt-1 pb-1 text-sm', brandText({ tone, part: 'contextLine' }))}
        >
          {contextLine}
        </p>
      ) : null}
    </>
  )
}
