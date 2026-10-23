import {
  farFutureHint,
  formatClock,
  formatSpan,
  formatStartsIn,
  formatTook,
  formatDoneAgo,
  formatDue,
  fromLocalInputValue,
  toLocalInputValue,
  isSameDay,
  nextAt,
  nextAtAsShown,
} from './dates'

// Jest runs in UTC (jest.config.js), so local time = UTC here.
const now = new Date('2026-10-14T10:00:00Z') // a Wednesday

test('formatDue: today, tomorrow, later this year, next year', () => {
  expect(formatDue(new Date('2026-10-14T14:30:00Z'), now)).toBe('Today 14:30')
  expect(formatDue(new Date('2026-10-15T09:00:00Z'), now)).toBe('Tomorrow 09:00')
  expect(formatDue(new Date('2026-10-16T14:30:00Z'), now)).toBe('Fri 16 Oct, 14:30')
  expect(formatDue(new Date('2027-01-05T08:05:00Z'), now)).toBe('Tue 5 Jan 2027, 08:05')
})

test('formatDoneAgo: just now, hours, yesterday, days, weeks', () => {
  const ago = (ms: number) => new Date(now.getTime() - ms)
  const h = 3_600_000
  expect(formatDoneAgo(ago(10 * 60_000), now)).toBe('Done just now')
  expect(formatDoneAgo(ago(3 * h), now)).toBe('Done 3h ago')
  expect(formatDoneAgo(ago(30 * h), now)).toBe('Done yesterday')
  expect(formatDoneAgo(ago(5 * 24 * h), now)).toBe('Done 5d ago')
  expect(formatDoneAgo(ago(15 * 24 * h), now)).toBe('Done 2w ago')
})

test('datetime-local values go both ways, in local time', () => {
  const d = new Date('2026-10-16T14:30:00Z')
  expect(toLocalInputValue(d)).toBe('2026-10-16T14:30')
  expect(fromLocalInputValue('2026-10-16T14:30')).toEqual(d)
  expect(fromLocalInputValue('')).toBeNull()
  expect(fromLocalInputValue('nonsense')).toBeNull()
})

test('nextAt: today when the time is still ahead, otherwise tomorrow', () => {
  // now = 10:00 (UTC, as Jest runs)
  expect(nextAt('15:00', now)).toEqual(new Date('2026-10-14T15:00:00Z'))
  expect(nextAt('10:01', now)).toEqual(new Date('2026-10-14T10:01:00Z')) // a minute ahead: today
  expect(nextAt('10:00', now)).toEqual(new Date('2026-10-15T10:00:00Z')) // right now: tomorrow
  expect(nextAt('09:00', now)).toEqual(new Date('2026-10-15T09:00:00Z'))
  expect(nextAt('07:30', now)).toEqual(new Date('2026-10-15T07:30:00Z'))
})

test('isSameDay compares calendar days', () => {
  expect(isSameDay(new Date('2026-10-14T23:59:00Z'), now)).toBe(true)
  expect(isSameDay(new Date('2026-10-15T00:00:00Z'), now)).toBe(false)
})

test('far-future hints by distance (Inventory tiers), none within a month', () => {
  const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000)
  expect(farFutureHint(inDays(10), now)).toBeNull()
  expect(farFutureHint(inDays(45), now)).toBe('Planning ahead. Respect.')
  expect(farFutureHint(inDays(120), now)).toBe("That's optimistic. We'll remind you anyway.")
  expect(farFutureHint(inDays(250), now)).toBe('Planning ahead or just postponing anxiety?')
  expect(farFutureHint(inDays(350), now)).toBe('See you in another life, maybe.')
  expect(farFutureHint(inDays(400), now)).toBeNull() // the form shows the error instead
})

test('formatStartsIn: days and hh:mm, under a day only hh:mm, then "Starting now"', () => {
  const later = (ms: number) => new Date(now.getTime() + ms)
  const h = 3_600_000
  expect(formatStartsIn(later(2 * 24 * h + 4 * h), now)).toBe('Starts in 2d 04:00')
  expect(formatStartsIn(later(4 * h + 12 * 60_000), now)).toBe('Starts in 04:12')
  expect(formatStartsIn(later(30_000), now)).toBe('Starting now')
  expect(formatStartsIn(later(-h), now)).toBe('Starting now')
})

test('formatSpan: days and hh:mm, under a day hh:mm, never negative', () => {
  expect(formatSpan(2 * 86_400_000 + 4 * 3_600_000)).toBe('2d 04:00')
  expect(formatSpan(4 * 3_600_000 + 12 * 60_000 + 59_000)).toBe('04:12')
  expect(formatSpan(-5000)).toBe('00:00')
})

test('formatClock ticks to the second (hours can pass 24), never negative', () => {
  expect(formatClock(42 * 60_000 + 17_000)).toBe('00:42:17')
  expect(formatClock(25 * 3_600_000)).toBe('25:00:00')
  expect(formatClock(-1)).toBe('00:00:00')
})

test('formatTook: minutes, hours, days', () => {
  expect(formatTook(45 * 60_000)).toBe('45 min')
  expect(formatTook(3 * 3_600_000 + 20 * 60_000)).toBe('3 h')
  expect(formatTook(2 * 86_400_000)).toBe('2 d')
  expect(formatTook(-60_000)).toBe('0 min')
})

test('nextAtAsShown: what the label promised, unless that moment has passed', () => {
  const shown = new Date('2026-10-14T14:59:30Z') // the chip said "Today 15:00"
  // Saved a few seconds later, still before 15:00: today, as promised.
  expect(nextAtAsShown('15:00', shown, new Date('2026-10-14T14:59:59Z'))).toEqual(
    new Date('2026-10-14T15:00:00Z'),
  )
  // The tick was late and 15:00 has passed: tomorrow, never a moment in the past.
  expect(nextAtAsShown('15:00', shown, new Date('2026-10-14T15:00:01Z'))).toEqual(
    new Date('2026-10-15T15:00:00Z'),
  )
})
