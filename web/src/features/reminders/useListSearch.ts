import { useRouterState } from '@tanstack/react-router'
import { isStatusKind, type ReminderStatusKind } from '../../components/ui/status'

// Saved with a page in the browser's history (not in the address).
declare module '@tanstack/react-router' {
  interface HistoryState {
    /** The list's tile when a reminder was opened from it. */
    listShow?: ReminderStatusKind
  }
}

/** For the list's link to a reminder: remembers the picked tile (none = All). */
export const fromList = (show: ReminderStatusKind | undefined) => ({ listShow: show })

/**
 * Where the reminder page's Back (and a delete) returns to: the list with the tile it was opened
 * from (/?show=done), not always "All". The list's link saves the tile in the browser's history
 * (history state, like a hidden search param), so it also survives a reload. Opened from a
 * notification or a typed address, there's none: back to "All".
 */
export function useListSearch(): { show?: ReminderStatusKind } {
  const show = useRouterState({ select: (state) => state.location.state.listShow })
  // Checked, not trusted: history state can be left over from an older version of the app.
  return isStatusKind(show) ? { show } : {}
}
