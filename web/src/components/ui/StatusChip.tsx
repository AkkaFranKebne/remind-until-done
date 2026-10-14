import { cva } from 'class-variance-authority'
import { cn } from '../../lib/cn'
import { statusIcon, statusLabel, type ReminderStatusKind } from './status'

const chip = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-full font-medium whitespace-nowrap',
  {
    variants: {
      status: {
        waiting: 'bg-tag-pending text-tag-pending-fg',
        nagging: 'bg-tag-nagging text-tag-nagging-fg',
        overdue: 'bg-tag-overdue-chip text-tag-overdue-chip-fg',
        done: 'bg-tag-done text-tag-done-fg',
      } satisfies Record<ReminderStatusKind, string>,
      size: { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-1 text-sm' },
      /** On the dark red nag-high row: a white pill with the row colour as text (contrast). */
      onNagHigh: { true: 'bg-chip-on-nag-high text-nag-high' },
      /** On a list row: Waiting and Done sit on their own tint, so they get a see-through pill. */
      onRow: { true: '' },
    },
    compoundVariants: [
      { onRow: true, status: 'waiting', className: 'bg-chip-on-waiting-row text-on-grad' },
      { onRow: true, status: 'done', className: 'bg-chip-on-done-row text-tag-done-fg' },
    ],
    defaultVariants: { size: 'md' },
  },
)

/**
 * Status pill: Waiting / Nagging / Overdue / Done, with its icon. On every list row, the detail
 * screen and the tiles.
 * Design Inventory → Components → "StatusChip", "ReminderRow".
 */
export function StatusChip({
  status,
  size,
  onNagHigh = false,
  onRow = false,
  className,
}: {
  status: ReminderStatusKind
  size?: 'sm' | 'md'
  onNagHigh?: boolean
  onRow?: boolean
  className?: string
}) {
  const Icon = statusIcon[status]
  return (
    <span className={cn(chip({ status, size, onNagHigh, onRow }), className)}>
      <Icon aria-hidden="true" size={size === 'sm' ? 10 : 12} strokeWidth={2} />
      {statusLabel[status]}
    </span>
  )
}
