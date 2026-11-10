import { ApiError } from './mutator'
import { ERROR, errorText } from './errorText'

test('a 429 says to slow down', () => {
  expect(errorText(new ApiError(429, 'rate_limited', 'x'), "Couldn't save. Try again.")).toBe(
    ERROR.slowDown,
  )
})

test('anything else keeps the screen own text', () => {
  const fallback = "Couldn't save. Try again."
  expect(errorText(new ApiError(500, 'internal', 'x'), fallback)).toBe(fallback)
  expect(errorText(new ApiError(0, 'network', 'x'), fallback)).toBe(fallback)
  expect(errorText(new Error('no token'), fallback)).toBe(fallback)
  expect(errorText(null, fallback)).toBe(fallback)
})
