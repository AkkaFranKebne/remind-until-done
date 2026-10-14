import { http, HttpResponse } from 'msw'
import type { Reminder, ReminderList } from '../lib/api/generated/model'
import { server } from '../mocks/server'

let n = 0

/** A reminder for tests: waiting, due in 1 hour. Override what the test is about. */
export function aReminder(over: Partial<Reminder> = {}): Reminder {
  n += 1
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    title: `Reminder ${n}`,
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nagIntervalMin: 60,
    nagCount: 0,
    nagsExhausted: false,
    ...over,
  }
}

/** The fake API answers GET /reminders?status=upcoming|done with these lists. */
export function mockReminders({
  upcoming = [],
  done = [],
  doneNextCursor = null,
}: {
  upcoming?: Reminder[]
  done?: Reminder[]
  doneNextCursor?: string | null
}) {
  server.use(
    http.get('*/api/v1/reminders', ({ request }) => {
      const status = new URL(request.url).searchParams.get('status')
      const body: ReminderList =
        status === 'done'
          ? { items: done, nextCursor: doneNextCursor }
          : { items: upcoming, nextCursor: null }
      return HttpResponse.json(body)
    }),
  )
}
