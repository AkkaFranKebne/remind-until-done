import { ApiError } from '../../lib/api/mutator'
import { saveErrorText } from './saveErrorText'

test('a failed save, in words', () => {
  expect(saveErrorText(null)).toBeNull()
  expect(saveErrorText(new ApiError(409, 'limit_reached', 'x'))).toMatch(/5 active reminders/)
  expect(saveErrorText(new ApiError(429, 'rate_limited', 'x'))).toBe(
    'Slow down a little. Try again in a minute.',
  )
  expect(saveErrorText(new ApiError(500, 'internal', 'x'))).toBe("Couldn't save. Try again.")
})
