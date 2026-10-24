import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  getGetReminderQueryKey,
  getListRemindersQueryKey,
} from '../../lib/api/generated/reminders/reminders'
import { readPushArrived } from '../../sw/messages'

/**
 * A push arrived while the app is open: the service worker says so (sw.ts), and the lists and that
 * reminder's page reload, so "Times bothered" and the countdown move on without a reload (design
 * doc 5.8). Only queries on screen refetch at once; the others reload when next shown.
 */
export function usePushRefresh() {
  const queryClient = useQueryClient()
  useEffect(() => {
    // No service worker (the dev server, tests, old browsers): no pushes either.
    if (!('serviceWorker' in navigator)) return
    const worker = navigator.serviceWorker
    const onMessage = (event: MessageEvent) => {
      const push = readPushArrived(event.data)
      if (!push) return
      void queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey() })
      if (push.reminderId) {
        void queryClient.invalidateQueries({ queryKey: getGetReminderQueryKey(push.reminderId) })
      }
    }
    worker.addEventListener('message', onMessage)
    return () => worker.removeEventListener('message', onMessage)
  }, [queryClient])
}
