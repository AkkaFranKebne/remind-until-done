/**
 * Dates as the app shows them, in the phone's own time zone (design doc 5.6). The server
 * only stores UTC instants; these turn them into words. Always English with 24-hour times,
 * like the Design Inventory's copy ("Tomorrow 09:00", "Fri 16 Oct, 14:30").
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
const dayMonth = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Calendar days from `now` to `d` in the phone's zone: 0 today, 1 tomorrow, -1 yesterday. */
function dayDiff(d: Date, now: Date): number {
  return Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / DAY)
}

/** "Today 14:30", "Tomorrow 09:00", "Fri 16 Oct, 14:30" (with the year when it's not this year). */
export function formatDue(due: Date, now: Date = new Date()): string {
  const days = dayDiff(due, now)
  const hhmm = time.format(due)
  if (days === 0) return `Today ${hhmm}`
  if (days === 1) return `Tomorrow ${hhmm}`
  const date = due.getFullYear() === now.getFullYear() ? dayMonth : dayMonthYear
  return `${date.format(due).replace(',', '')}, ${hhmm}`
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** A span of time to the minute: "2d 04:00", under a day "04:12". Negative counts as 0. */
export function formatSpan(ms: number): string {
  const left = Math.max(0, ms)
  const days = Math.floor(left / DAY)
  const hhmm = `${pad2(Math.floor((left % DAY) / HOUR))}:${pad2(Math.floor((left % HOUR) / MINUTE))}`
  return days > 0 ? `${days}d ${hhmm}` : hhmm
}

/** A ticking clock to the second: "00:42:17" (hours can pass 24). Negative counts as 0. */
export function formatClock(ms: number): string {
  const left = Math.max(0, Math.floor(ms / 1000))
  return `${pad2(Math.floor(left / 3600))}:${pad2(Math.floor((left % 3600) / 60))}:${pad2(left % 60)}`
}

/** How long something took, roughly: "45 min", "3 h", "2 d". Negative counts as 0. */
export function formatTook(ms: number): string {
  const took = Math.max(0, ms)
  if (took < HOUR) return `${Math.floor(took / MINUTE)} min`
  if (took < DAY) return `${Math.floor(took / HOUR)} h`
  return `${Math.floor(took / DAY)} d`
}

/** Countdown to the first push: "Starts in 2d 04:00", under a day "Starts in 04:12", or "Starting now". */
export function formatStartsIn(due: Date, now: Date = new Date()): string {
  const left = due.getTime() - now.getTime()
  if (left < MINUTE) return 'Starting now'
  return `Starts in ${formatSpan(left)}`
}

/** "Done just now", "Done 3h ago", "Done yesterday", "Done 5d ago", "Done 2w ago". */
export function formatDoneAgo(doneAt: Date, now: Date = new Date()): string {
  const ago = now.getTime() - doneAt.getTime()
  if (ago < HOUR) return 'Done just now'
  if (ago < DAY) return `Done ${Math.floor(ago / HOUR)}h ago`
  if (ago < 2 * DAY) return 'Done yesterday'
  if (ago < 7 * DAY) return `Done ${Math.floor(ago / DAY)}d ago`
  return `Done ${Math.floor(ago / (7 * DAY))}w ago`
}

/** The value a native datetime-local field uses: "2026-10-16T14:30", local time. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Back from a datetime-local value (local time); null if empty or not a date. */
export function fromLocalInputValue(value: string): Date | null {
  if (!value) return null
  const d = new Date(value) // "YYYY-MM-DDTHH:mm" without a zone is read as local time
  return Number.isNaN(d.getTime()) ? null : d
}

/** Same moment with seconds and milliseconds cut off: times are picked to the minute. */
export function toMinute(d: Date): Date {
  const m = new Date(d)
  m.setSeconds(0, 0)
  return m
}

/**
 * The next time it's "HH:MM" (the user's default time from Settings), local time: today if that
 * moment is still ahead, even by a minute, otherwise tomorrow (owner 2026-10-23, decision 49).
 */
export function nextAt(timeOfDay: string, now: Date = new Date()): Date {
  const [h = 9, m = 0] = timeOfDay.split(':').map(Number)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m)
  return today > now ? today : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m)
}

/**
 * What a chip built from `shownNow` promised (decision 49): nextAt from that moment, so the save
 * matches the label. If that moment has passed by now (the screen's clock ticks a hair late),
 * the next one.
 */
export function nextAtAsShown(timeOfDay: string, shownNow: Date, now: Date = new Date()): Date {
  const shown = nextAt(timeOfDay, shownNow)
  return shown > now ? shown : nextAt(timeOfDay, now)
}

/** Same calendar day as `now`, in the phone's zone. */
export function isSameDay(d: Date, now: Date = new Date()): boolean {
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

/**
 * The friendly hint under the date picker for far-away dates (Inventory → UX Copy →
 * "Far-future date hints"). Null for dates within a month, and beyond a year (the form's error says it).
 */
export function farFutureHint(due: Date, now: Date = new Date()): string | null {
  const days = (due.getTime() - now.getTime()) / DAY
  if (days > 365) return null // beyond a year the form shows its error instead of a hint
  if (days > 330) return 'See you in another life, maybe.' // the last month before the limit
  if (days > 182) return 'Planning ahead or just postponing anxiety?'
  if (days > 91) return "That's optimistic. We'll remind you anyway."
  if (days > 30) return 'Planning ahead. Respect.'
  return null
}
