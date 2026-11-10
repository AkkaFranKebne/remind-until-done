import { ApiError } from './mutator'
import { createQueryClient } from './queryClient'

const retry = createQueryClient().getDefaultOptions().queries?.retry

test('a query retries only what can fix itself, and never a 429', () => {
  if (typeof retry !== 'function') throw new Error('retry should be a function')
  expect(retry(0, new ApiError(0, 'network', 'x'))).toBe(true)
  expect(retry(0, new ApiError(503, 'unavailable', 'x'))).toBe(true)
  expect(retry(2, new ApiError(503, 'unavailable', 'x'))).toBe(false) // at most twice
  // Asking again at once would only use up more of the rate limit (decision 86).
  expect(retry(0, new ApiError(429, 'rate_limited', 'x'))).toBe(false)
  expect(retry(0, new ApiError(404, 'not_found', 'x'))).toBe(false)
})
