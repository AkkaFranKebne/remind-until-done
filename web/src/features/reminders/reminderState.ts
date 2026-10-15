import type { ReminderStatusKind } from '../../components/ui/status'
import type { Reminder } from '../../lib/api/generated/model'
import { formatClock, formatDoneAgo, formatSpan, formatStartsIn } from '../../lib/dates'
import { intervalOptions } from './addReminderForm'

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
      return formatStartsIn(new Date(r.dueAt), now)
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

/**
 * The reminder page's line under the title (Inventory → UX Copy, owner decision 2026-10-15).
 * Nagging uses the row's lines until M5, when it shows the latest push message instead.
 */
export function pageSubLine(r: Reminder): string {
  switch (rowLevel(r)) {
    case 'waiting':
      return 'Waiting patiently.'
    case 'overdue':
      return "We gave it everything we had. 12 reminders. Zero response. You're on your own now."
    case 'done':
      return 'Done. We knew you had it in you.'
    default:
      return rowSubLine(r)
  }
}

/** The big countdown on the reminder page: its label and value (null = label only). */
export type Countdown = { label: string; value: string | null }

/**
 * Waiting: time to the first push. Nagging: time to the next push, to the second (the API's
 * nextNagAt). Overdue: how late, counted from the due time. Done: no countdown (null).
 */
export function pageCountdown(r: Reminder, now: Date): Countdown | null {
  const due = new Date(r.dueAt).getTime()
  switch (rowLevel(r)) {
    case 'done':
      return null
    case 'waiting':
      return due - now.getTime() < 60_000
        ? { label: 'Starting now', value: null }
        : { label: 'Starts in', value: formatSpan(due - now.getTime()) }
    case 'overdue':
      return { label: 'Overdue by', value: formatSpan(now.getTime() - due) }
    default: {
      // While a push is going out there's no next time yet: 00:00:00.
      const next = r.nextNagAt ? new Date(r.nextNagAt).getTime() : now.getTime()
      return { label: 'Next nag in', value: formatClock(next - now.getTime()) }
    }
  }
}

/** "1 h", "15 min": the chip's label, or minutes for a value without a chip. */
export function intervalLabel(minutes: number): string {
  return intervalOptions.find((o) => o.value === String(minutes))?.label ?? `${minutes} min`
}

/**
 * When the countdown has just reached 0 (the first or next push is due), the server is about to
 * change the reminder: ask again every 15 s for 5 minutes, so the page moves on by itself.
 * Not while waiting for nothing: done and overdue reminders have no countdown to reach.
 */
export function pollAfterCountdown(r: Reminder, now = Date.now()): number | false {
  const level = rowLevel(r)
  if (level === 'done' || level === 'overdue') return false
  const at = Date.parse(level === 'waiting' ? r.dueAt : (r.nextNagAt ?? r.updatedAt))
  return now >= at && now - at < 5 * 60_000 ? 15_000 : false
}
