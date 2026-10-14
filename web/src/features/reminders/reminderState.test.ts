import type { Reminder } from '../../lib/api/generated/model'
import { rowLevel, rowSubLine, statusKind } from './reminderState'

const now = new Date('2026-10-14T10:00:00Z')

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r1',
    title: 'Call dentist',
    dueAt: '2026-10-15T09:00:00Z',
    status: 'pending',
    createdAt: '2026-10-14T08:00:00Z',
    updatedAt: '2026-10-14T08:00:00Z',
    nagIntervalMin: 60,
    nagCount: 0,
    nagsExhausted: false,
    ...over,
  }
}

test.each([
  [{}, 'waiting', 'waiting', 'Starts in 23:00'],
  [{ status: 'sending' as const }, 'waiting', 'waiting', 'Starts in 23:00'],
  [{ status: 'sent' as const, nagCount: 2 }, 'nag-low', 'nagging', 'Gently nagging (2/12)'],
  [{ status: 'sent' as const, nagCount: 5 }, 'nag-mid', 'nagging', 'Still here (5/12)'],
  [{ status: 'sent' as const, nagCount: 10 }, 'nag-high', 'nagging', 'Getting desperate (10/12)'],
  [
    { status: 'sent' as const, nagCount: 12, nagsExhausted: true },
    'overdue',
    'overdue',
    "We gave up. You didn't.",
  ],
  [{ status: 'done' as const, doneAt: '2026-10-09T10:00:00Z' }, 'done', 'done', 'Done 5d ago'],
])('%o → %s row, %s, "%s"', (over, level, kind, sub) => {
  const r = reminder(over)
  expect(rowLevel(r)).toBe(level)
  expect(statusKind(r)).toBe(kind)
  expect(rowSubLine(r, now)).toBe(sub)
})
