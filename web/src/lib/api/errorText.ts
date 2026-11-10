import { ApiError } from './mutator'

/** The API said too many requests (429 rate_limited, design doc 7.2). Inventory → UX Copy. */
export const SLOW_DOWN = 'Slow down a little. Try again in a minute.'

/**
 * A failed request in words: the screen's own text, or SLOW_DOWN when the API is limiting this
 * user. Then "Try again" right away would only fail again, so the text says to wait.
 */
export function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.status === 429 ? SLOW_DOWN : fallback
}
