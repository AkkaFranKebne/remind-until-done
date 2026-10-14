import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { ReminderList } from '../lib/api/generated/model'
import { getUserMock } from '../lib/api/generated/user/user.msw'

/** No reminders: a fixed answer, so tests don't depend on random mock data. */
const noReminders: ReminderList = { items: [], nextCursor: null }

/**
 * The fake API for Jest tests (MSW). It answers every call the app makes: /me with the
 * mocks orval generated from swagger.json, the reminders list with an empty list. A test
 * changes one answer with `server.use(handler)`; jest.setup.ts resets that after each test.
 */
export const server = setupServer(
  ...getUserMock(),
  http.get('*/api/v1/reminders', () => HttpResponse.json(noReminders)),
)
