import { toLocalInputValue } from '../../lib/dates'
import {
  addReminderSchema,
  intervalOptions,
  MAX_NAG_INTERVAL,
  MAX_NOTE,
  MAX_TITLE,
  MIN_NAG_INTERVAL,
} from './addReminderForm'

test("the form's limits come from swagger.json (the API's contract)", () => {
  expect(MAX_TITLE).toBe(200)
  expect(MAX_NOTE).toBe(200)
  expect([MIN_NAG_INTERVAL, MAX_NAG_INTERVAL]).toEqual([15, 1440])
})

test('every interval chip is a value the API accepts', () => {
  for (const option of intervalOptions) {
    const minutes = Number(option.value)
    expect(minutes).toBeGreaterThanOrEqual(MIN_NAG_INTERVAL)
    expect(minutes).toBeLessThanOrEqual(MAX_NAG_INTERVAL)
  }
})

describe('editing: the saved time', () => {
  const saved = toLocalInputValue(new Date(Date.now() - 3 * 3_600_000)) // nagging: due 3 h ago
  const values = {
    title: 'Pay rent',
    note: '',
    when: 'custom' as const,
    customAt: saved,
    interval: '60',
  }

  test('kept as it is, a time in the past is fine (it is not sent again)', () => {
    expect(addReminderSchema('09:00', saved).safeParse(values).success).toBe(true)
  })

  test('changed to another past time, it is refused', () => {
    const earlier = toLocalInputValue(new Date(Date.now() - 5 * 3_600_000))
    const result = addReminderSchema('09:00', saved).safeParse({ ...values, customAt: earlier })
    expect(result.error?.issues[0]?.message).toBe('That time has already passed.')
  })

  test('creating (no saved time), a past time is refused', () => {
    expect(addReminderSchema('09:00').safeParse(values).success).toBe(false)
  })
})
