import {
  farFutureHint,
  formatDoneAgo,
  formatDue,
  fromLocalInputValue,
  toLocalInputValue,
  tomorrowAt,
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

test("tomorrowAt uses the user's morning time", () => {
  expect(tomorrowAt('09:00', now)).toEqual(new Date('2026-10-15T09:00:00Z'))
  expect(tomorrowAt('07:30', now)).toEqual(new Date('2026-10-15T07:30:00Z'))
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
