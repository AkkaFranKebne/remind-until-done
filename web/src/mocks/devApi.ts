import { http, HttpResponse } from 'msw'
import * as z from 'zod/mini'
import type { Reminder, ReminderList, User } from '../lib/api/generated/model'
import {
  createReminderBodyNagIntervalMinMax as INTERVAL_MAX,
  createReminderBodyNagIntervalMinMin as INTERVAL_MIN,
  createReminderBodyNoteMax as NOTE_MAX,
  createReminderBodyTitleMax as TITLE_MAX,
} from '../lib/api/generated/zod/reminders/reminders'
import { UpdateMeBody } from '../lib/api/generated/zod/user/user'
import { countCharacters } from '../lib/text'
import { devDevicesHandlers, resetDevDevices } from './devDevicesApi'

/**
 * The fake API for `npm run dev:mock`: the app's real calls, answered in the browser by MSW from
 * data kept in memory (a reload starts over). It follows the real API's rules where the screens
 * notice them (design doc 2.2 and decision 35): 5 active at most, the title/note/interval limits,
 * a new time restarts the cycle, a new interval moves a nagging reminder's next nag (decision 62),
 * done is final until moved to a new time, unknown ids are 404.
 * It starts with one reminder in each state, so nagging and overdue screens can be built before
 * M4 (the real API can't produce them yet). Nothing sends pushes here: a nagging countdown stops
 * at 00:00:00 (reload to reset the clocks). Dev only: never imported by the production build.
 */

const MAX_ACTIVE = 5
const MAX_PUSHES = 12
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

let user: User = {
  id: 'mock-user',
  email: 'tester@example.com',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  defaultTimeOfDay: '09:00',
  defaultNagIntervalMin: 60,
}

let nextId = 1
const iso = (ms: number) => new Date(ms).toISOString()

function make(title: string, over: Partial<Reminder>): Reminder {
  const now = Date.now()
  return {
    id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
    title,
    note: null,
    dueAt: iso(now + DAY),
    status: 'pending',
    sentAt: null,
    nextNagAt: null,
    doneAt: null,
    createdAt: iso(now - DAY),
    updatedAt: iso(now - DAY),
    nagIntervalMin: 60,
    nagCount: 0,
    nagsExhausted: false,
    ...over,
  }
}

/** A reminder that has sent `count` pushes, every `interval` minutes, the last one 20 min ago. */
function nagging(title: string, count: number, interval = 60): Reminder {
  const lastPush = Date.now() - 20 * MINUTE
  const exhausted = count >= MAX_PUSHES
  return make(title, {
    status: 'sent',
    dueAt: iso(lastPush - (count - 1) * interval * MINUTE),
    sentAt: iso(lastPush),
    nextNagAt: exhausted ? null : iso(lastPush + interval * MINUTE),
    nagIntervalMin: interval,
    nagCount: count,
    nagsExhausted: exhausted,
  })
}

// Fixed ids: "Renew passport" is always …0004 after a reset.
const seed = (): Reminder[] => {
  nextId = 1
  return [
    make('Book a plumber', { dueAt: iso(Date.now() + 2 * DAY + 4 * HOUR) }),
    nagging('Reply to landlord', 5),
    nagging('Call dentist', 10),
    nagging('Renew passport', MAX_PUSHES),
    make('Buy birthday card', { status: 'done', doneAt: iso(Date.now() - 3 * HOUR) }),
    make('Water the plants', { status: 'done', doneAt: iso(Date.now() - 5 * DAY) }),
  ]
}
let reminders = seed()

/** Back to the starting data (tests). */
export function resetDevData() {
  reminders = seed()
  resetDevDevices()
}

/** As the API answers: nagsExhausted is worked out each time, like the Go model does. */
const view = (r: Reminder): Reminder => ({
  ...r,
  nagsExhausted: r.status === 'sent' && r.nextNagAt == null && r.nagCount >= MAX_PUSHES,
})

// The request bodies' shape (swagger.json). Lengths are checked below in characters after
// trimming, like the API and the form (countCharacters), not in Zod's UTF-16 units.
const interval = z.int().check(z.gte(INTERVAL_MIN), z.lte(INTERVAL_MAX))
const CreateBody = z.object({
  title: z.string(),
  note: z.nullish(z.string()),
  dueAt: z.iso.datetime({ offset: true }),
  nagIntervalMin: z.optional(interval),
})
const UpdateBody = z.object({
  title: z.optional(z.string()),
  note: z.nullish(z.string()),
  dueAt: z.optional(z.iso.datetime({ offset: true })),
  nagIntervalMin: z.optional(interval),
})

/** The title and note rules; null when fine, otherwise the error message. */
function checkText(title: string | undefined, note: string | null | undefined): string | null {
  if (title !== undefined) {
    const n = countCharacters(title.trim())
    if (n < 1 || n > TITLE_MAX) return `title must be 1 to ${TITLE_MAX} characters`
  }
  if (note && countCharacters(note.trim()) > NOTE_MAX) {
    return `note must be at most ${NOTE_MAX} characters`
  }
  return null
}

const error = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status })
const invalid = (message: string) => error(400, 'validation_failed', message)
const notFound = () => error(404, 'not_found', 'no such reminder')
const limitReached = () =>
  error(409, 'limit_reached', 'you can have 5 active reminders; finish or delete one first')
const isActive = (r: Reminder) => r.status !== 'done'

/** The time rules swagger.json can't express; null when fine, otherwise the error message. */
function checkDueAt(dueAt: string | undefined): string | null {
  if (dueAt === undefined) return null
  const due = Date.parse(dueAt)
  if (due < Date.now() - MINUTE) return 'dueAt is in the past'
  if (due > Date.now() + 365 * DAY) return 'dueAt is more than a year ahead'
  return null
}

const find = (id: string | readonly string[] | undefined) => reminders.find((r) => r.id === id)

function listOf(status: string, limit: number): ReminderList {
  const items =
    status === 'done'
      ? reminders
          .filter((r) => r.status === 'done')
          .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
      : reminders.filter(isActive).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  // One page is enough here: the fake never has more than a handful.
  return { items: items.slice(0, limit).map(view), nextCursor: null }
}

export const devHandlers = [
  http.get('*/api/v1/me', () => HttpResponse.json(user)),
  http.patch('*/api/v1/me', async ({ request }) => {
    const body = UpdateMeBody.safeParse(await request.json())
    if (!body.success) return invalid('body does not match swagger.json')
    user = { ...user, ...body.data }
    return HttpResponse.json(user)
  }),

  http.get('*/api/v1/reminders', ({ request }) => {
    const params = new URL(request.url).searchParams
    const status = params.get('status') ?? 'upcoming'
    const limit = Number(params.get('limit') ?? 50)
    if (status !== 'upcoming' && status !== 'done')
      return invalid('status must be upcoming or done')
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return invalid('limit must be between 1 and 100')
    }
    return HttpResponse.json(listOf(status, limit))
  }),

  http.post('*/api/v1/reminders', async ({ request }) => {
    const parsed = CreateBody.safeParse(await request.json())
    if (!parsed.success) return invalid('body does not match swagger.json')
    const body = parsed.data
    const problem = checkText(body.title, body.note) ?? checkDueAt(body.dueAt)
    if (problem) return invalid(problem)
    if (reminders.filter(isActive).length >= MAX_ACTIVE) return limitReached()
    const created = make(body.title.trim(), {
      note: body.note?.trim() || null,
      dueAt: body.dueAt,
      nagIntervalMin: body.nagIntervalMin ?? user.defaultNagIntervalMin,
      createdAt: iso(Date.now()),
      updatedAt: iso(Date.now()),
    })
    reminders.push(created)
    return HttpResponse.json(view(created), { status: 201 })
  }),

  http.get('*/api/v1/reminders/:id', ({ params }) => {
    const r = find(params.id)
    return r ? HttpResponse.json(view(r)) : notFound()
  }),

  http.patch('*/api/v1/reminders/:id', async ({ params, request }) => {
    const r = find(params.id)
    if (!r) return notFound()
    const parsed = UpdateBody.safeParse(await request.json())
    if (!parsed.success) return invalid('body does not match swagger.json')
    const body = parsed.data
    // The same time again is not a move, and isn't checked (it may be in the past).
    const moved = body.dueAt !== undefined && Date.parse(body.dueAt) !== Date.parse(r.dueAt)
    const problem = checkText(body.title, body.note) ?? (moved ? checkDueAt(body.dueAt) : null)
    if (problem) return invalid(problem)
    if (moved && !isActive(r) && reminders.filter(isActive).length >= MAX_ACTIVE) {
      return limitReached()
    }
    if (body.title !== undefined) r.title = body.title.trim()
    if (body.note !== undefined) r.note = body.note?.trim() || null
    if (body.nagIntervalMin !== undefined && body.nagIntervalMin !== r.nagIntervalMin) {
      r.nagIntervalMin = body.nagIntervalMin
      // Nagging: the next nag moves to the last push plus the new interval, or, if that has
      // passed, the new interval from now. Never right after the save.
      if (!moved && r.status === 'sent' && r.nextNagAt != null && r.sentAt != null) {
        const fromLast = Date.parse(r.sentAt) + body.nagIntervalMin * MINUTE
        r.nextNagAt = iso(
          fromLast > Date.now() ? fromLast : Date.now() + body.nagIntervalMin * MINUTE,
        )
      }
    }
    if (moved && body.dueAt) {
      // A new time starts the cycle again (and makes a done reminder active again).
      Object.assign(r, {
        dueAt: body.dueAt,
        status: 'pending',
        nagCount: 0,
        nextNagAt: null,
        doneAt: null,
      } satisfies Partial<Reminder>)
    }
    r.updatedAt = iso(Date.now())
    return HttpResponse.json(view(r))
  }),

  http.delete('*/api/v1/reminders/:id', ({ params }) => {
    const i = reminders.findIndex((r) => r.id === params.id)
    if (i < 0) return notFound()
    reminders.splice(i, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('*/api/v1/reminders/:id/done', ({ params }) => {
    const r = find(params.id)
    if (!r) return notFound()
    if (isActive(r)) {
      Object.assign(r, {
        status: 'done',
        doneAt: iso(Date.now()),
        nextNagAt: null,
        updatedAt: iso(Date.now()),
      } satisfies Partial<Reminder>)
    }
    return HttpResponse.json(view(r))
  }),

  // Push devices (M3): devDevicesApi.ts.
  ...devDevicesHandlers,
]
