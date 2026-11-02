import type { Reminder } from '../../lib/api/generated/model'
import {
  intervalLabel,
  listOrder,
  pageCountdown,
  pageSubLine,
  pollAfterCountdown,
  rowLevel,
  rowSubLine,
  statusKind,
} from './reminderState'

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
  [{}, 'waiting', 'waiting', 'Starts in 23 h'],
  [{ status: 'sending' as const }, 'waiting', 'waiting', 'Starts in 23 h'],
  [{ status: 'sent' as const, nagCount: 2 }, 'nag-low', 'nagging', 'Gently nagging'],
  [{ status: 'sent' as const, nagCount: 5 }, 'nag-mid', 'nagging', 'Still here'],
  [{ status: 'sent' as const, nagCount: 10 }, 'nag-high', 'nagging', 'Getting desperate'],
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

describe('the reminder page', () => {
  const nagging = reminder({ status: 'sent', nagCount: 4, nextNagAt: '2026-10-14T10:42:17Z' })
  const overdue = reminder({
    status: 'sent',
    nagCount: 12,
    nagsExhausted: true,
    dueAt: '2026-10-10T19:38:00Z',
  })

  test('the funny line comes from the UX Copy (nagging: the row lines until M5)', () => {
    expect(pageSubLine(reminder())).toBe('Waiting patiently.')
    expect(pageSubLine(nagging)).toBe('Still here')
    expect(pageSubLine(overdue)).toMatch(/^We gave it everything we had/)
    expect(pageSubLine(reminder({ status: 'done' }))).toBe('Done. We knew you had it in you.')
  })

  test('countdown: to the first push, to the next push (seconds), how late; none when done', () => {
    expect(pageCountdown(reminder(), now)).toEqual({
      label: 'Starts in',
      value: '23 h',
      due: false,
    })
    expect(pageCountdown(nagging, now)).toEqual({
      label: 'Next nag in',
      value: '42:17',
      due: false,
    })
    expect(pageCountdown(overdue, now)).toEqual({
      label: 'Overdue by',
      value: '3 d 14 h',
      due: false,
    })
    expect(pageCountdown(reminder({ status: 'done' }), now)).toBeNull()
  })

  test('a push due now: "Starting now" or 00:00, marked due so it pulses', () => {
    for (const dueAt of ['2026-10-14T10:00:30Z', '2026-10-14T09:59:00Z']) {
      expect(pageCountdown(reminder({ dueAt }), now)).toEqual({
        label: 'First nag',
        value: 'Starting now',
        due: true,
      })
    }
    expect(pageCountdown({ ...nagging, nextNagAt: null }, now)).toEqual({
      label: 'Next nag in',
      value: '00:00',
      due: true,
    })
    const almost = new Date(now.getTime() + 1_500).toISOString()
    expect(pageCountdown({ ...nagging, nextNagAt: almost }, now)?.due).toBe(false) // 00:01
  })

  test('the interval reads like its chip', () => {
    expect(intervalLabel(60)).toBe('1 h')
    expect(intervalLabel(45)).toBe('45 min')
  })
})

test('right after a countdown reaches 0 the page asks the server again (every 15 s, for 5 min)', () => {
  const t = now.getTime()
  const at = (ms: number) => new Date(t + ms).toISOString()
  expect(pollAfterCountdown(reminder({ dueAt: at(60_000) }), t)).toBe(false) // still counting
  expect(pollAfterCountdown(reminder({ dueAt: at(-30_000) }), t)).toBe(15_000) // just due
  expect(pollAfterCountdown(reminder({ dueAt: at(-10 * 60_000) }), t)).toBe(false) // long ago
  const nagging = { status: 'sent' as const, nagCount: 3 }
  expect(pollAfterCountdown(reminder({ ...nagging, nextNagAt: at(-5_000) }), t)).toBe(15_000)
  expect(pollAfterCountdown(reminder({ status: 'done' }), t)).toBe(false)
})

describe('listOrder', () => {
  const at = (h: number) => `2026-10-14T${String(h).padStart(2, '0')}:00:00Z`
  const overdue = (id: string, dueH: number) =>
    reminder({ id, status: 'sent', nagCount: 12, nagsExhausted: true, dueAt: at(dueH) })
  const nagging = (id: string, count: number, nextH: number | null) =>
    reminder({
      id,
      status: 'sent',
      nagCount: count,
      dueAt: at(1),
      nextNagAt: nextH === null ? null : at(nextH),
    })
  const waiting = (id: string, dueH: number) => reminder({ id, dueAt: at(dueH) })

  test('overdue, then nagging, then waiting, each in its own order', () => {
    const list = [
      waiting('w-later', 20),
      nagging('n2-later', 2, 12),
      overdue('o-newer', 5),
      waiting('w-sooner', 15),
      nagging('n2-sending', 2, null),
      nagging('n9', 9, 13),
      nagging('n2-sooner', 2, 11),
      nagging('n1', 1, 10),
      overdue('o-older', 2),
      reminder({ id: 'w-sending', status: 'sending', dueAt: at(9) }),
    ]
    expect(list.sort(listOrder).map((r) => r.id)).toEqual([
      'o-older', // the longest overdue first
      'o-newer',
      'n9', // the most pushes sent first
      'n2-sooner', // same count: the soonest next nag first
      'n2-later',
      'n2-sending', // no next time yet: last of the same count
      'n1', // fewer pushes: after, even with a sooner next nag
      'w-sending', // sending its first push: still waiting
      'w-sooner',
      'w-later',
    ])
  })
})
