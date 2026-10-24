import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { Reminder, UpdateReminder } from '../../lib/api/generated/model'
import { formatDue } from '../../lib/dates'
import { server } from '../../mocks/server'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { aReminder, mockReminders } from '../../test-utils/reminders'
import { mockMe, renderApp } from '../../test-utils/renderApp'

beforeEach(() => mockMe())

const ID = '00000000-0000-4000-8000-00000000abcd'

function isUpdate(v: unknown): v is UpdateReminder {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** The fake API knows this one reminder (GET), and records what the page sends. */
function mockReminder(over: Partial<Reminder> = {}) {
  let current = aReminder({ id: ID, title: 'Call the bank', ...over })
  const sent: { method: string; body?: UpdateReminder }[] = []
  server.use(
    http.get(`*/api/v1/reminders/${ID}`, () => HttpResponse.json(current)),
    http.post(`*/api/v1/reminders/${ID}/done`, () => {
      sent.push({ method: 'done' })
      current = { ...current, status: 'done', doneAt: new Date().toISOString() }
      return HttpResponse.json(current)
    }),
    http.patch(`*/api/v1/reminders/${ID}`, async ({ request }) => {
      const body: unknown = await request.json()
      if (!isUpdate(body)) throw new Error(`not an UpdateReminder: ${JSON.stringify(body)}`)
      sent.push({ method: 'patch', body })
      current = { ...current, ...body, note: body.note ?? null }
      return HttpResponse.json(current)
    }),
    http.delete(`*/api/v1/reminders/${ID}`, () => {
      sent.push({ method: 'delete' })
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return sent
}

const openPage = () => renderApp(`/r/${ID}`, new FakeAuthClient(tester))
const title = () => screen.findByRole('heading', { level: 1, name: 'Call the bank' })

test('waiting: the countdown to the first push, the interval and 0 / 12, and Done', async () => {
  mockReminder({
    dueAt: new Date(Date.now() + 2 * 86_400_000 + 4 * 3_600_000 + 30_000).toISOString(),
  })
  openPage()

  expect(await title()).toBeInTheDocument()
  expect(screen.getByText('Waiting patiently.')).toBeInTheDocument()
  expect(screen.getByText('Starts in')).toBeInTheDocument()
  expect(screen.getByText('2d 04:00')).toBeInTheDocument()
  expect(screen.getByText('Nagging every').nextElementSibling).toHaveTextContent('1 h')
  expect(screen.getByText('Times bothered').nextElementSibling).toHaveTextContent('0 / 12')
  expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  // Remind later lives only on the Android notification (decided 2026-10-15).
  expect(screen.queryByRole('button', { name: /Remind later/ })).not.toBeInTheDocument()
  // Opened directly (a notification, a typed address): no tile to return to, so all reminders.
  expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/')
})

test("nagging: counts down to the next push (the API's nextNagAt), to the second", async () => {
  mockReminder({
    status: 'sent',
    nagCount: 4,
    nextNagAt: new Date(Date.now() + 42 * 60_000 + 17_500).toISOString(),
  })
  openPage()

  expect(await title()).toBeInTheDocument()
  expect(screen.getByText('Still here (4/12)')).toBeInTheDocument()
  expect(screen.getByText('Next nag in')).toBeInTheDocument()
  expect(screen.getByText(/^00:42:1\d$/)).toBeInTheDocument()
})

test('overdue: how late, counted from the due time, and the dramatic line', async () => {
  mockReminder({
    status: 'sent',
    nagCount: 12,
    nagsExhausted: true,
    dueAt: new Date(
      Date.now() - (3 * 86_400_000 + 14 * 3_600_000 + 22 * 60_000 + 30_000),
    ).toISOString(),
  })
  openPage()

  expect(await title()).toBeInTheDocument()
  expect(screen.getByText(/^We gave it everything we had\./)).toBeInTheDocument()
  expect(screen.getByText('Overdue by')).toBeInTheDocument()
  expect(screen.getByText('3d 14:22')).toBeInTheDocument()
})

test('Done: the page turns into the done state', async () => {
  const sent = mockReminder({ status: 'sent', nagCount: 2 })
  openPage()

  fireEvent.click(await screen.findByRole('button', { name: 'Done' }))

  expect(await screen.findByText('Done. We knew you had it in you.')).toBeInTheDocument()
  expect(sent).toEqual([{ method: 'done' }])
  expect(screen.getByText('Completed')).toBeInTheDocument()
  expect(screen.getByText('Nagged').nextElementSibling).toHaveTextContent('2 / 12')
  expect(screen.getByText('Took')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
})

test('a failed Done says so on the page', async () => {
  mockReminder()
  server.use(
    http.post(`*/api/v1/reminders/${ID}/done`, () =>
      HttpResponse.json({ error: { code: 'internal', message: 'x' } }, { status: 500 }),
    ),
  )
  openPage()

  fireEvent.click(await screen.findByRole('button', { name: 'Done' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Something went wrong. Try again in a moment.',
  )
})

test('delete asks first: Keep it stays, Delete removes it and goes back to the list', async () => {
  const sent = mockReminder()
  openPage()

  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
  let sheet = await screen.findByRole('alertdialog', { name: 'Delete this reminder?' })
  expect(within(sheet).getByText("We'll stop nagging. Just this once.")).toBeInTheDocument()
  fireEvent.click(within(sheet).getByRole('button', { name: 'Keep it' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  expect(sent).toEqual([])

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  sheet = await screen.findByRole('alertdialog', { name: 'Delete this reminder?' })
  fireEvent.click(within(sheet).getByRole('button', { name: 'Delete' }))

  expect(await screen.findByRole('heading', { name: 'Your reminders' })).toBeInTheDocument()
  expect(sent).toEqual([{ method: 'delete' }])
  // The same toast as a swipe-delete on the list.
  expect(screen.getByText("Gone. We'll pretend it never happened.")).toBeInTheDocument()
})

test('opened from a picked tile: Back returns to that tile, not to All', async () => {
  mockReminder({ status: 'done', doneAt: new Date().toISOString() })
  mockReminders({ done: [aReminder({ id: ID, title: 'Call the bank', status: 'done' })] })
  const router = renderApp('/?show=done', new FakeAuthClient(tester))

  fireEvent.click(await screen.findByRole('link', { name: /Call the bank/ }))
  await title()
  const back = screen.getByRole('link', { name: 'Back' })
  expect(back).toHaveAttribute('href', '/?show=done')

  fireEvent.click(back)
  await waitFor(() => expect(router.state.location.search).toEqual({ show: 'done' }))
})

test('delete from a picked tile goes back to that tile', async () => {
  mockReminder({ status: 'done', doneAt: new Date().toISOString() })
  mockReminders({ done: [aReminder({ id: ID, title: 'Call the bank', status: 'done' })] })
  const router = renderApp('/?show=done', new FakeAuthClient(tester))

  fireEvent.click(await screen.findByRole('link', { name: /Call the bank/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
  const sheet = await screen.findByRole('alertdialog', { name: 'Delete this reminder?' })
  fireEvent.click(within(sheet).getByRole('button', { name: 'Delete' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.location.search).toEqual({ show: 'done' })
})

test('edit: "Adjust the trap" starts with the saved values; keeping the time does not send it', async () => {
  const dueAt = new Date(Date.now() - 3 * 3_600_000)
  const sent = mockReminder({ status: 'sent', nagCount: 3, dueAt: dueAt.toISOString() })
  openPage()

  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
  const sheet = await screen.findByRole('dialog', { name: 'Adjust the trap' })
  const titleField = within(sheet).getByRole('textbox', { name: 'What are you forgetting?' })
  expect(titleField).toHaveValue('Call the bank')
  expect(within(sheet).getByRole('radio', { name: formatDue(dueAt) })).toBeChecked() // the saved time
  expect(within(sheet).getByRole('radio', { name: '1 h' })).toBeChecked()
  expect(within(sheet).getByText(/Changing the start time resets everything/)).toBeInTheDocument()

  fireEvent.change(titleField, { target: { value: 'Call the bank (again)' } })
  fireEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }))

  expect(
    await screen.findByRole('heading', { level: 1, name: 'Call the bank (again)' }),
  ).toBeInTheDocument()
  expect(sent).toEqual([
    { method: 'patch', body: { title: 'Call the bank (again)', note: null, nagIntervalMin: 60 } },
  ])
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test('edit: a new time is sent (it restarts the nag cycle)', async () => {
  const sent = mockReminder()
  openPage()

  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
  const sheet = await screen.findByRole('dialog', { name: 'Adjust the trap' })
  fireEvent.click(within(sheet).getByRole('radio', { name: 'In 3 h' }))
  fireEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }))

  await waitFor(() => expect(sent).toHaveLength(1))
  const due = Date.parse(sent[0]?.body?.dueAt ?? '')
  expect(due - Date.now()).toBeGreaterThan(2.9 * 3_600_000)
})

test('an unknown reminder (or another user\'s): "doesn\'t exist" and a way home', async () => {
  server.use(
    http.get(`*/api/v1/reminders/${ID}`, () =>
      HttpResponse.json({ error: { code: 'not_found', message: 'x' } }, { status: 404 }),
    ),
  )
  openPage()

  expect(
    await screen.findByRole('heading', { name: "This reminder doesn't exist." }),
  ).toBeInTheDocument()
  expect(screen.getByText(/Maybe it got done without you\./)).toBeInTheDocument()
  expect(screen.getByText(/Or it never existed\. Who knows\./)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to list' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/')
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
})
