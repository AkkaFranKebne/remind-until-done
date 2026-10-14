import { Link } from '@tanstack/react-router'
import { cva } from 'class-variance-authority'
import { ArrowUpRight } from 'lucide-react'
import { StatusChip } from '../../components/ui/StatusChip'
import type { Reminder } from '../../lib/api/generated/model'
import { cn } from '../../lib/cn'
import { rowLevel, rowSubLine, statusKind, type RowLevel } from './reminderState'

const row = cva(
  [
    // relative + z-10 on focus: the next card overlaps by 8px and would cover the focus ring.
    'relative flex min-h-20 items-center gap-3 rounded-md px-3.5 shadow-sm focus-visible:z-10',
    'transition-colors duration-(--duration-fast) motion-reduce:transition-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  ],
  {
    variants: {
      level: {
        waiting: 'bg-waiting-row-bg',
        'nag-low': 'bg-nag-low',
        'nag-mid': 'bg-nag-mid',
        'nag-high': 'bg-nag-high',
        overdue: 'bg-tag-overdue',
        done: 'bg-tag-done',
      } satisfies Record<RowLevel, string>,
    },
  },
)

const title = cva('truncate text-base font-semibold', {
  variants: {
    level: {
      // Row tints are the same in both themes, so the text is fixed dark too (not text-fg).
      waiting: 'text-on-row',
      'nag-low': 'text-on-row',
      'nag-mid': 'text-on-row',
      'nag-high': 'text-nag-high-fg',
      overdue: 'text-tag-overdue-fg',
      // Done: crossed out and quieter.
      done: 'font-normal text-on-grad-fg2 line-through',
    } satisfies Record<RowLevel, string>,
  },
})

/** Second line and arrow: the row's own dark text colour (on light tints) or a light one. */
const tone = cva('', {
  variants: {
    level: {
      waiting: 'text-on-grad-fg2',
      'nag-low': 'text-nag-low-fg',
      'nag-mid': 'text-nag-mid-fg',
      'nag-high': 'text-nag-high-fg/90', // 70% (Inventory before) was 3.7:1; 90% is 5.3:1
      overdue: 'text-tag-overdue-fg/80',
      done: 'text-on-grad-fg2',
    } satisfies Record<RowLevel, string>,
  },
})

const arrow = cva('shrink-0', {
  variants: {
    level: {
      waiting: 'text-on-grad', // fixed violet: accent2 turns pale in dark mode
      'nag-low': 'text-nag-low-fg',
      'nag-mid': 'text-nag-mid-fg',
      'nag-high': 'text-nag-high-fg',
      overdue: 'text-tag-overdue-fg',
      done: 'text-on-grad-fg2',
    } satisfies Record<RowLevel, string>,
  },
})

/**
 * One reminder in the list. The background carries the urgency (waiting violet → amber →
 * coral → deep red → overdue dark red; done green); a chip shows the category only while
 * nagging or overdue; from the 4th push a dot pulses. The whole row is a link to /r/:id.
 * Design Inventory → Components → "ReminderRow — all variants", Motion 3 "Nag pulse dot".
 */
export function ReminderRow({
  reminder,
  now,
  className,
}: {
  reminder: Reminder
  now?: Date
  className?: string
}) {
  const level = rowLevel(reminder)
  const kind = statusKind(reminder)
  const showChip = kind === 'nagging' || kind === 'overdue'
  const pulse = level === 'nag-mid' || level === 'nag-high'

  return (
    <Link to="/r/$id" params={{ id: reminder.id }} className={cn(row({ level }), className)}>
      <span className="min-w-0 flex-1 py-4">
        <span className={cn('block', title({ level }))}>{reminder.title}</span>
        <span className={cn('mt-0.5 flex items-center gap-1.5 text-sm', tone({ level }))}>
          {rowSubLine(reminder, now)}
          {pulse ? (
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-current animate-nag-pulse motion-reduce:animate-none"
            />
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end justify-center gap-1.5 py-3.5 pr-1">
        {showChip ? <StatusChip size="sm" status={kind} onNagHigh={level === 'nag-high'} /> : null}
        <ArrowUpRight aria-hidden="true" size={18} strokeWidth={2.5} className={arrow({ level })} />
      </span>
    </Link>
  )
}
