import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { Reminder } from '../../lib/api/generated/model'
import { server } from '../../mocks/server'
import { pretendServiceWorker, resetDevice } from '../../test-utils/device'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { aReminder, mockReminders } from '../../test-utils/reminders'
import { mockMe, renderApp } from '../../test-utils/renderApp'

// Design doc 5.8: an open page refreshes when a push arrives, and a reminder's notification
// leaves the tray once it no longer applies.

const ID = '00000000-0000-4000-8000-00000000beef'

beforeEach(() => mockMe())
afterEach(resetDevice)

/** The fake API's copy of the reminder: a test changes it, as a push would on the server. */
function serveReminder(over: Partial<Reminder>) {
  const api = { current: aReminder({ id: ID, title: 'Call the bank', ...over }) }
  server.use(
    http.get(`*/api/v1/reminders/${ID}`, () => HttpResponse.json(api.current)),
    http.post(`*/api/v1/reminders/${ID}/done`, () => {
      api.current = { ...api.current, status: 'done', doneAt: new Date().toISOString() }
      return HttpResponse.json(api.current)
    }),
    http.patch(`*/api/v1/reminders/${ID}`, async ({ request }) => {
      const body: object = Object(await request.json())
      // A new time restarts the reminder, as the real API does (design doc 3.2).
      const restart = 'dueAt' in body ? { status: 'pending' as const, nagCount: 0 } : {}
      api.current = { ...api.current, ...body, ...restart }
      return HttpResponse.json(api.current)
    }),
    http.delete(`*/api/v1/reminders/${ID}`, () => new HttpResponse(null, { status: 204 })),
  )
  return api
}

const bothered = () => screen.getByText('Times bothered').nextElementSibling
const nagging = {
  status: 'sent',
  nagCount: 3,
  dueAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
} as const

test('the reminder page: a push for it moves "Times bothered" on, without a reload', async () => {
  const sw = pretendServiceWorker()
  const api = serveReminder(nagging)
  renderApp(`/r/${ID}`, new FakeAuthClient(tester))
  await waitFor(() => expect(bothered()).toHaveTextContent('3 / 12'))

  api.current = { ...api.current, nagCount: 4 } // the server sent push 4
  sw.push(ID)

  await waitFor(() => expect(bothered()).toHaveTextContent('4 / 12'))
})

test('the list: any push reloads it (a console test push too); other worker messages do not', async () => {
  const sw = pretendServiceWorker()
  const asked = mockReminders({ upcoming: [aReminder({ id: ID, title: 'Call the bank' })] })
  renderApp('/', new FakeAuthClient(tester))
  expect(await screen.findByText('Call the bank')).toBeInTheDocument()
  const before = asked.length
  const upcomingLoads = () => asked.slice(before).filter((q) => q.includes('upcoming')).length

  sw.message({ type: 'MOCKING_ENABLED' }) // MSW's worker in mock mode
  sw.message('hello')
  sw.push(ID)
  await waitFor(() => expect(upcomingLoads()).toBe(1)) // only the push counted

  sw.push() // no reminder: a test from the Firebase console
  await waitFor(() => expect(upcomingLoads()).toBe(2))
})

test('Done closes the reminder’s notification in the tray', async () => {
  const sw = pretendServiceWorker()
  sw.tray.add(ID)
  sw.tray.add('another-reminder')
  serveReminder(nagging)
  renderApp(`/r/${ID}`, new FakeAuthClient(tester))

  fireEvent.click(await screen.findByRole('button', { name: 'Done' }))

  await waitFor(() => expect(sw.closed).toEqual([ID]))
  expect(sw.tray).toEqual(new Set(['another-reminder']))
})

test('delete closes it too; a new title on a nagging reminder keeps it', async () => {
  const sw = pretendServiceWorker()
  sw.tray.add(ID)
  serveReminder(nagging)
  mockReminders({})
  renderApp(`/r/${ID}`, new FakeAuthClient(tester))

  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
  const sheet = await screen.findByRole('dialog', { name: 'Adjust the trap' })
  fireEvent.change(within(sheet).getByRole('textbox', { name: 'What are you forgetting?' }), {
    target: { value: 'Call the bank again' },
  })
  fireEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }))
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Call the bank again' }),
  ).toBeInTheDocument()
  expect(sw.closed).toEqual([]) // still nagging: the nag in the tray still applies

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  const confirm = await screen.findByRole('alertdialog', { name: 'Delete this reminder?' })
  fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))

  await waitFor(() => expect(sw.closed).toEqual([ID]))
})

test('a new time closes it: the old nag no longer applies', async () => {
  const sw = pretendServiceWorker()
  sw.tray.add(ID)
  serveReminder(nagging)
  renderApp(`/r/${ID}`, new FakeAuthClient(tester))

  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
  const sheet = await screen.findByRole('dialog', { name: 'Adjust the trap' })
  fireEvent.click(within(sheet).getByRole('radio', { name: 'In 3 h' }))
  fireEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }))

  expect(await screen.findByText('Waiting patiently.')).toBeInTheDocument()
  await waitFor(() => expect(sw.closed).toEqual([ID]))
})
