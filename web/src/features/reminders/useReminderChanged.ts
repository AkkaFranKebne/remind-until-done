import { useQueryClient } from '@tanstack/react-query'
import type { Reminder } from '../../lib/api/generated/model'
import {
  getGetReminderQueryKey,
  getListRemindersQueryKey,
} from '../../lib/api/generated/reminders/reminders'
import { closeNotificationsOf } from '../../lib/notificationTray'

/**
 * After an edit, Done or delete: the reminder page shows the new state at once (the API's
 * answer goes straight into the cache), and the lists and tiles reload (design doc 5.5).
 * Deleted (no answer): the reminder's own cache entry is removed.
 * Its notification leaves the tray when it no longer applies: deleted, Done, or waiting again
 * (a new time). A nagging reminder whose title changed keeps it.
 */
export function useReminderChanged() {
  const queryClient = useQueryClient()
  return async (id: string, updated?: Reminder) => {
    if (updated) queryClient.setQueryData(getGetReminderQueryKey(id), updated)
    else queryClient.removeQueries({ queryKey: getGetReminderQueryKey(id) })
    if (!updated || updated.status === 'done' || updated.status === 'pending') {
      void closeNotificationsOf(id)
    }
    await queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey() })
  }
}
