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

/**
 * The fake API answers GET /reminders?status=upcoming|done (and ?limit=) with these lists.
 * Returns the query strings it was asked, so a test can check what was loaded when.
 */
export function mockReminders({
  upcoming = [],
  done = [],
  doneNextCursor = null,
}: {
  upcoming?: Reminder[]
  done?: Reminder[]
  doneNextCursor?: string | null
}) {
  const asked: string[] = []
  server.use(
    http.get('*/api/v1/reminders', ({ request }) => {
      const params = new URL(request.url).searchParams
      asked.push(params.toString())
      const limit = Number(params.get('limit') ?? 50)
      const items = params.get('status') === 'done' ? done : upcoming
      const body: ReminderList = {
        items: items.slice(0, limit),
        nextCursor:
          items.length > limit ? 'more' : params.get('status') === 'done' ? doneNextCursor : null,
      }
      return HttpResponse.json(body)
    }),
  )
  return asked
}
