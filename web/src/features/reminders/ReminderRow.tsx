import { Link } from '@tanstack/react-router'
import { cva } from 'class-variance-authority'
import { ArrowUpRight } from 'lucide-react'
import { StatusChip } from '../../components/ui/StatusChip'
import type { Reminder } from '../../lib/api/generated/model'
import { cn } from '../../lib/cn'
import { rowLevel, rowSubLine, statusKind, type RowLevel } from './reminderState'

/** Shadows deepen down the stack (Inventory → ReminderRow): row 1 … 5 and below. */
const depthShadow = ['shadow-row-1', 'shadow-row-2', 'shadow-row-3', 'shadow-row-4', 'shadow-row-5']

const row = cva(
  [
    // relative + z-10 on focus: the next card overlaps by 8px and would cover the focus ring.
    'relative flex min-h-18 items-center gap-2.5 rounded-md px-3',
    'transition-colors duration-(--duration-fast) motion-reduce:transition-none',
    'focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-grad',
  ],
  {
    variants: {
      // Row tints and their text colours stay the same in dark mode (status hue never inverts).
      level: {
        waiting: 'bg-waiting-row-bg text-on-grad',
        'nag-low': 'bg-nag-low text-nag-low-fg',
        'nag-mid': 'bg-nag-mid text-nag-mid-fg',
        'nag-high': 'bg-nag-high text-nag-high-fg',
        overdue: 'bg-tag-overdue text-tag-overdue-fg',
        done: 'bg-tag-done text-tag-done-fg',
      } satisfies Record<RowLevel, string>,
    },
  },
)

/**
 * One reminder in the list, as the Inventory's phone mockup: the background and text colour
 * carry the urgency (waiting violet → amber → coral → deep red → overdue dark red; done green),
 * a status chip on every row, from the 4th push a pulsing dot. The whole row is a link to /r/:id.
 * Design Inventory → Phone Screens → "/ — Reminders list", Components → "ReminderRow",
 * Motion 3 "Nag pulse dot".
 */
export function ReminderRow({
  reminder,
  now,
  position = 1,
  className,
}: {
  reminder: Reminder
  now?: Date
  /** Place in the list (1 = top): later rows get a deeper shadow. */
  position?: number
  className?: string
}) {
  const level = rowLevel(reminder)
  const kind = statusKind(reminder)
  const pulse = level === 'nag-mid' || level === 'nag-high'
  const shadow = depthShadow[Math.min(Math.max(position, 1), 5) - 1]

  return (
    <Link
      to="/r/$id"
      params={{ id: reminder.id }}
      className={cn(row({ level }), shadow, className)}
    >
      <span className="min-w-0 flex-1 py-3">
        <span
          className={cn(
            'block truncate text-base font-semibold',
            level === 'done' && 'line-through decoration-tag-done-fg/40',
          )}
        >
          {reminder.title}
        </span>
        {/* 90%: the mockup's 75% is below 4.5:1 for small text. */}
        <span className="mt-0.5 flex items-center gap-1.5 text-xs opacity-90">
          {rowSubLine(reminder, now)}
          {pulse ? (
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-current animate-nag-pulse motion-reduce:animate-none"
            />
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end justify-center gap-1 py-3">
        <StatusChip size="sm" status={kind} onRow onNagHigh={level === 'nag-high'} />
        <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2.5} />
      </span>
    </Link>
  )
}
