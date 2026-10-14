import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/cn'
import { statusIcon, statusLabel, type ReminderStatusKind } from './status'

const order: ReminderStatusKind[] = ['waiting', 'nagging', 'overdue', 'done']

const tile = cva(
  [
    'flex min-h-27.5 cursor-pointer flex-col justify-between rounded-md px-4 pt-3.5 pb-4 text-left shadow-sm',
    'transition-opacity duration-(--duration-fast) active:opacity-85 motion-reduce:transition-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    // A tile with nothing in it is muted and can't be picked.
    'data-disabled:cursor-default data-disabled:opacity-40',
  ],
  {
    variants: {
      status: {
        // Fixed colours like the other tiles (status hue never inverts in dark mode).
        waiting: 'bg-waiting-row-bg text-on-grad data-pressed:bg-tile-waiting-active',
        nagging: 'bg-tag-nagging text-tag-nagging-fg data-pressed:tile-ring-active',
        overdue:
          'bg-tile-overdue text-tile-overdue-fg tile-ring-overdue data-pressed:tile-ring-active',
        done: 'bg-tag-done text-tag-done-fg data-pressed:tile-ring-active',
      } satisfies Record<ReminderStatusKind, string>,
    },
  },
)

/**
 * The 2×2 tiles above the reminders list: Waiting, Nagging, Overdue (with a count) and Done
 * (no number: Design Inventory).
 * They are the list's filter (there are no tabs): tap one to show only those, tap it again
 * to show all active reminders. Built on Base UI's Toggle Group (not a radio group) because
 * the picked tile can be un-picked. Screen readers hear "Nagging, 3, toggle button, pressed".
 * Design Inventory → Components → "StatusTiles".
 */
export function StatusTiles({
  counts,
  hideCount = ['done'],
  value,
  onChange,
  className,
}: {
  /** How many of each; 0 makes the tile muted and not pickable. */
  counts: Record<ReminderStatusKind, number>
  /** Tiles that show no number (only muted when their count is 0). Default: Done. */
  hideCount?: ReminderStatusKind[]
  /** The picked tile; null = none (all active reminders). */
  value: ReminderStatusKind | null
  onChange: (value: ReminderStatusKind | null) => void
  className?: string
}) {
  return (
    <ToggleGroup
      aria-label="Filter reminders"
      value={value ? [value] : []}
      onValueChange={(next) => onChange(order.find((status) => next.includes(status)) ?? null)}
      className={cn('grid grid-cols-2 gap-2.5', className)}
    >
      {order.map((status) => {
        const Icon = statusIcon[status]
        const count = counts[status]
        return (
          <Toggle key={status} value={status} disabled={count === 0} className={tile({ status })}>
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-full bg-tile-icon-bg"
            >
              <Icon size={20} strokeWidth={2} />
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="text-base font-bold">{statusLabel[status]}</span>
              {hideCount.includes(status) ? null : (
                <span className="text-xl font-bold tabular-nums">{count}</span>
              )}
            </span>
          </Toggle>
        )
      })}
    </ToggleGroup>
  )
}
