import { ERROR, errorText } from '../../lib/api/errorText'
import { ApiError } from '../../lib/api/mutator'

/** A failed save, in words (Inventory → UX Copy). Null when there's nothing to show. */
export function saveErrorText(error: unknown): string | null {
  if (!error) return null
  if (error instanceof ApiError && error.code === 'limit_reached') {
    return "You've hit 5 active reminders. Finish one before adding another. We believe in you."
  }
  return errorText(error, ERROR.save)
}
