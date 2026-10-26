import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/cn'
import { statusIcon, statusLabel, type ReminderStatusKind } from './status'

const order: ReminderStatusKind[] = ['waiting', 'nagging', 'overdue', 'done']

const tile = cva(
  [
    'group flex min-h-22.5 cursor-pointer flex-col justify-between rounded-md px-3 pt-2.5 pb-3 text-left',
    'transition-opacity duration-(--duration-fast) active:opacity-85 motion-reduce:transition-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-grad',
    // A tile with nothing in it is muted and can't be picked.
    'data-disabled:cursor-default data-disabled:opacity-40',
  ],
  {
    variants: {
      // data-dimmed (another tile is picked): only the background and icon circle fade; the
      // label and count keep full contrast, because the tile stays tappable (WCAG 1.4.3).
      status: {
        waiting:
          'bg-tile-waiting text-on-grad data-pressed:tile-ring-picked data-dimmed:bg-tile-waiting/40',
        nagging:
          'bg-tile-nagging text-tag-nagging-fg data-pressed:tile-ring-picked data-dimmed:bg-tile-nagging/40',
        overdue:
          'bg-tile-overdue text-tile-overdue-fg data-pressed:tile-ring-picked data-dimmed:bg-tile-overdue/40',
        done: 'bg-tile-done text-tag-done-fg data-pressed:tile-ring-picked data-dimmed:bg-tile-done/40',
      } satisfies Record<ReminderStatusKind, string>,
    },
  },
)

/**
 * The 2×2 tiles above the reminders list (as the Inventory's phone mockup): Waiting, Nagging, Overdue (with a count) and Done
 * (no number: Design Inventory).
 * They are the list's filter (there are no tabs): tap one to show only those, tap it again
 * to show all active reminders. While one is picked, the others dim. Built on Base UI's Toggle Group (not a radio group) because
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
      className={cn('grid grid-cols-2 gap-2', className)}
    >
      {order.map((status) => {
        const Icon = statusIcon[status]
        const count = counts[status]
        return (
          <Toggle
            key={status}
            value={status}
            disabled={count === 0}
            data-dimmed={value !== null && value !== status ? '' : undefined}
            className={tile({ status })}
          >
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-full bg-tile-icon-bg group-data-dimmed:opacity-40"
            >
              <Icon size={16} strokeWidth={2} />
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">{statusLabel[status]}</span>
              {hideCount.includes(status) ? null : (
                <span className="text-lg font-bold tabular-nums">{count}</span>
              )}
            </span>
          </Toggle>
        )
      })}
    </ToggleGroup>
  )
}
