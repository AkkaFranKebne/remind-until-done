import {
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
