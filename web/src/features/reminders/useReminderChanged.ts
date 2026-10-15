import { useQueryClient } from '@tanstack/react-query'
import type { Reminder } from '../../lib/api/generated/model'
import {
  getGetReminderQueryKey,
  getListRemindersQueryKey,
} from '../../lib/api/generated/reminders/reminders'

/**
 * After an edit, Done or delete: the reminder page shows the new state at once (the API's
 * answer goes straight into the cache), and the lists and tiles reload (design doc 5.5).
 * Deleted (no answer): the reminder's own cache entry is removed.
 */
export function useReminderChanged() {
  const queryClient = useQueryClient()
  return async (id: string, updated?: Reminder) => {
    if (updated) queryClient.setQueryData(getGetReminderQueryKey(id), updated)
    else queryClient.removeQueries({ queryKey: getGetReminderQueryKey(id) })
    await queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey() })
  }
}
