import { Link, useSearch } from '@tanstack/react-router'
import { cva } from 'class-variance-authority'
import { ArrowUpRight } from 'lucide-react'
import { StatusChip } from '../../components/ui/StatusChip'
import type { Reminder } from '../../lib/api/generated/model'
import { cn } from '../../lib/cn'
import { rowLevel, rowSubLine, statusKind, type RowLevel } from './reminderState'
import { fromList } from './useListSearch'

const row = cva(
  [
    // relative + z-10 on focus: the next card overlaps by 8px and would cover the focus ring.
    // shadow-row: the 1px frame in the row's own text colour (--row-frame), flat.
    'relative flex min-h-18 items-center gap-2.5 rounded-md px-3 shadow-row',
    'transition-colors duration-(--duration-fast) motion-reduce:transition-none',
    'focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-grad',
  ],
  {
    variants: {
      // The tint and text carry the urgency. Dark mode: dark tints of the same hue, light text
      // (index.css). Overdue also gets a thin ember ring, in both themes.
      level: {
        waiting: 'bg-waiting-row-bg text-on-grad',
        'nag-low': 'bg-nag-low text-nag-low-fg',
        'nag-mid': 'bg-nag-mid text-nag-mid-fg',
        'nag-high': 'bg-nag-high text-nag-high-fg',
        overdue: 'bg-tag-overdue text-tag-overdue-fg inset-ring inset-ring-row-overdue-ring',
        done: 'bg-tag-done text-tag-done-fg',
      } satisfies Record<RowLevel, string>,
    },
  },
)

/**
 * One reminder in the list, as the Inventory's phone mockup: the background and text colour
 * carry the urgency (waiting mauve → gold → amber → orange → overdue ember; done green),
 * a status chip on every row, from the 4th push a pulsing dot. The whole row is a link to /r/:id.
 * Design Inventory → Phone Screens → "/ — Reminders list", Components → "ReminderRow",
 * Motion 3 "Nag pulse dot".
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
  const pulse = level === 'nag-mid' || level === 'nag-high'
  // The picked tile goes along, so the reminder page's Back returns to it (useListSearch).
  const { show } = useSearch({ strict: false })

  return (
    <Link
      to="/r/$id"
      params={{ id: reminder.id }}
      state={fromList(show)}
      className={cn(row({ level }), className)}
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
        {/* 90%: the mockup's 75% is below 4.5:1 for small text. tokens.contrast.test.ts checks
            the sub-line at this opacity on every row colour. */}
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
