import { ERROR } from '../../lib/api/errorText'

/** Toast copy for reminder actions (Inventory → UX Copy). One place, so the list and the reminder page say the same. */
export const toastText = {
  /** Only if the API sent no done line: normally the toast shows that line (design doc 3.8). */
  done: 'Finally. Done.',
  deleted: "Gone. We'll pretend it never happened.",
  failed: ERROR.generic,
} as const
