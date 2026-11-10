import { ApiError } from './mutator'

/**
 * Error texts used on more than one screen (Inventory → UX Copy), so a copy change happens in one
 * place. A text only one feature shows stays next to that feature.
 */
export const ERROR = {
  /** Any failed action or load without a better word for it. */
  generic: 'Something went wrong. Try again in a moment.',
  /** A setting or a reminder that didn't save. */
  save: "Couldn't save. Try again.",
  /** Enable notifications didn't work (permission, token or API). */
  notifications: "Couldn't turn on notifications. Try again.",
  /** The API said too many requests (429 rate_limited, design doc 7.2, decision 86). */
  slowDown: 'Slow down a little. Try again in a minute.',
} as const

/**
 * A failed request in words: the screen's own text, or ERROR.slowDown when the API is limiting
 * this user. Then "Try again" right away would only fail again, so the text says to wait.
 */
export function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.status === 429 ? ERROR.slowDown : fallback
}
