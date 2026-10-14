import type { ReminderStatusKind } from '../../components/ui/status'
import type { Reminder } from '../../lib/api/generated/model'
import { formatDoneAgo, formatDue } from '../../lib/dates'

/** Pushes per cycle before a reminder counts as overdue (the API's MaxPushes). */
export const MAX_PUSHES = 12

/**
 * How urgent a row looks: the row colour (Inventory → "Nag-count row tints").
 * waiting → nag-low (pushes 1–3) → nag-mid (4–8) → nag-high (9–11) → overdue (12, no Done) · done.
 */
export type RowLevel = 'waiting' | 'nag-low' | 'nag-mid' | 'nag-high' | 'overdue' | 'done'

export function rowLevel(r: Reminder): RowLevel {
  if (r.status === 'done') return 'done'
  if (r.nagsExhausted) return 'overdue'
  if (r.nagCount === 0) return 'waiting' // includes "sending" its first push
  if (r.nagCount <= 3) return 'nag-low'
  if (r.nagCount <= 8) return 'nag-mid'
  return 'nag-high'
}

/** The status category: tiles, the chip, the filter. */
export function statusKind(r: Reminder): ReminderStatusKind {
  const level = rowLevel(r)
  if (level === 'waiting' || level === 'overdue' || level === 'done') return level
  return 'nagging'
}

/** The row's second line (Inventory → UX Copy → row sub-lines). */
export function rowSubLine(r: Reminder, now: Date = new Date()): string {
  const level = rowLevel(r)
  const count = `(${r.nagCount}/${MAX_PUSHES})`
  switch (level) {
    case 'waiting':
      return formatDue(new Date(r.dueAt), now)
    case 'nag-low':
      return `Gently nagging ${count}`
    case 'nag-mid':
      return `Still here ${count}`
    case 'nag-high':
      return `Getting desperate ${count}`
    case 'overdue':
      return "We gave up. You didn't."
    case 'done':
      return r.doneAt ? formatDoneAgo(new Date(r.doneAt), now) : 'Done'
  }
}
