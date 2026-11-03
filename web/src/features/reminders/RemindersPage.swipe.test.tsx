import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { aReminder, mockReminders } from '../../test-utils/reminders'
import { mockMe, renderApp } from '../../test-utils/renderApp'

// jsdom has no layout: give every row a phone-sized width (40% of 300 = 120px to mark done).
beforeEach(() => {
  mockMe()
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 72))
})
afterEach(() => jest.restoreAllMocks())

const openList = () => renderApp('/', new FakeAuthClient(tester))

/** Drags a row sideways by dx px (right is positive): a finger, or a mouse with its button held. */
function swipe(row: HTMLElement, dx: number, pointerType: 'touch' | 'mouse' = 'touch') {
  const at = { clientX: 150, clientY: 30, button: 0, pointerId: 1, pointerType }
  const held = { ...at, buttons: 1 }
  fireEvent.pointerDown(row, held)
  fireEvent.pointerMove(row, { ...held, clientX: 150 + dx / 2 })
  fireEvent.pointerMove(row, { ...held, clientX: 150 + dx })
  fireEvent.pointerUp(row, { ...at, clientX: 150 + dx })
}

test('the list lifts toasts above the + button', async () => {
  mockReminders({ upcoming: [aReminder({ title: 'Call dentist' })] })
  openList()

  await screen.findByRole('link', { name: /Call dentist/ })
  expect(document.querySelector('[data-toast-above-fab]')).not.toBeNull()
})

test("swipe right past 40%: the toast shows the API's done line", async () => {
  const dentist = aReminder({ title: 'Call dentist', status: 'sent', nagCount: 2 })
  mockReminders({ upcoming: [dentist] })
  server.use(
    http.post(`*/api/v1/reminders/${dentist.id}/done`, () => {
      mockReminders({ upcoming: [] })
      return HttpResponse.json({
        ...dentist,
        status: 'done',
        line: 'Look at you, finishing things.',
      })
    }),
  )
  openList()

  swipe(await screen.findByRole('link', { name: /Call dentist/ }), 200)

  expect(await screen.findByText('Look at you, finishing things.')).toBeInTheDocument()
  expect(screen.queryByText('Finally. Done.')).not.toBeInTheDocument()
})

test('swipe right past 40%: Done is sent, the row leaves, and a toast says so', async () => {
  const dentist = aReminder({ title: 'Call dentist', status: 'sent', nagCount: 2 })
  mockReminders({ upcoming: [dentist, aReminder({ title: 'Book a plumber' })] })
  const sent: string[] = []
  server.use(
    http.post(`*/api/v1/reminders/${dentist.id}/done`, () => {
      sent.push(dentist.id)
      // The list reloads after Done: now without the dentist.
      mockReminders({ upcoming: [aReminder({ title: 'Book a plumber' })] })
      return HttpResponse.json({ ...dentist, status: 'done', doneAt: new Date().toISOString() })
    }),
  )
  openList()

  swipe(await screen.findByRole('link', { name: /Call dentist/ }), 200)

  expect(await screen.findByText('Finally. Done.')).toBeInTheDocument()
  expect(sent).toEqual([dentist.id])
  await waitFor(() =>
    expect(screen.queryByRole('link', { name: /Call dentist/ })).not.toBeInTheDocument(),
  )
  expect(screen.getByRole('link', { name: /Book a plumber/ })).toBeInTheDocument()
})

test('a short swipe right snaps back: nothing is sent, and the tap does not open the reminder', async () => {
  const dentist = aReminder({ title: 'Call dentist' })
  mockReminders({ upcoming: [dentist] })
  const sent = jest.fn()
  server.use(http.post('*/api/v1/reminders/:id/done', sent))
  const router = openList()

  const row = await screen.findByRole('link', { name: /Call dentist/ })
  swipe(row, 60)
  fireEvent.click(row)

  expect(sent).not.toHaveBeenCalled()
  expect(router.state.location.pathname).toBe('/')
})

test('after a touch swipe (no click follows), the next tap opens the reminder', async () => {
  const dentist = aReminder({ title: 'Call dentist' })
  mockReminders({ upcoming: [dentist] })
  const router = openList()

  const row = await screen.findByRole('link', { name: /Call dentist/ })
  swipe(row, -30) // snaps back; a phone sends no click after a drag
  fireEvent.pointerDown(row, {
    clientX: 150,
    clientY: 30,
    button: 0,
    pointerId: 2,
    pointerType: 'touch',
  })
  fireEvent.pointerUp(row, {
    clientX: 150,
    clientY: 30,
    button: 0,
    pointerId: 2,
    pointerType: 'touch',
  })
  fireEvent.click(row)

  await waitFor(() => expect(router.state.location.pathname).toBe(`/r/${dentist.id}`))
})

test('if the phone cancels the touch (a call, Control Center), nothing is marked done', async () => {
  mockReminders({ upcoming: [aReminder({ title: 'Call dentist', status: 'sent', nagCount: 2 })] })
  const sent = jest.fn()
  server.use(http.post('*/api/v1/reminders/:id/done', sent))
  openList()

  const row = await screen.findByRole('link', { name: /Call dentist/ })
  const at = { clientX: 150, clientY: 30, button: 0, pointerId: 1, pointerType: 'touch' }
  fireEvent.pointerDown(row, at)
  fireEvent.pointerMove(row, { ...at, clientX: 250 })
  fireEvent.pointerMove(row, { ...at, clientX: 350 })
  fireEvent.pointerCancel(row, { ...at, clientX: 350 })

  await new Promise((resolve) => setTimeout(resolve, 300))
  expect(sent).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: /Call dentist/ })).toBeInTheDocument()
})

test('swipe left past 40%: deleted at once, like Done (no button, no sheet), with a toast', async () => {
  const dentist = aReminder({ title: 'Call dentist' })
  mockReminders({ upcoming: [dentist] })
  const deleted: string[] = []
  server.use(
    http.delete(`*/api/v1/reminders/${dentist.id}`, () => {
      deleted.push(dentist.id)
      mockReminders({})
      return new HttpResponse(null, { status: 204 })
    }),
  )
  openList()

  swipe(await screen.findByRole('link', { name: /Call dentist/ }), -200)

  await waitFor(() => expect(deleted).toEqual([dentist.id]))
  // No confirm sheet (the toast is a dialog too, in Base UI).
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(await screen.findByText("Gone. We'll pretend it never happened.")).toBeInTheDocument()
  await waitFor(() =>
    expect(screen.queryByRole('link', { name: /Call dentist/ })).not.toBeInTheDocument(),
  )
})

test('a short swipe left snaps back and deletes nothing; a mouse swipe deletes too', async () => {
  const dentist = aReminder({ title: 'Call dentist' })
  mockReminders({ upcoming: [dentist] })
  const deleted = jest.fn(() => new HttpResponse(null, { status: 204 }))
  server.use(http.delete('*/api/v1/reminders/:id', deleted))
  const router = openList()

  const row = await screen.findByRole('link', { name: /Call dentist/ })
  swipe(row, -80, 'mouse')
  fireEvent.click(row) // a mouse sends a click after its drag: it must not open the reminder
  expect(router.state.location.pathname).toBe('/')
  await new Promise((resolve) => setTimeout(resolve, 300))
  expect(deleted).not.toHaveBeenCalled()

  swipe(row, -200, 'mouse')
  await waitFor(() => expect(deleted).toHaveBeenCalledTimes(1))
})

test('if the API refuses, the row comes back with an error toast', async () => {
  const dentist = aReminder({ title: 'Call dentist', status: 'sent', nagCount: 2 })
  mockReminders({ upcoming: [dentist] })
  server.use(
    http.post(`*/api/v1/reminders/${dentist.id}/done`, () =>
      HttpResponse.json({ error: { code: 'internal', message: 'x' } }, { status: 500 }),
    ),
  )
  openList()

  swipe(await screen.findByRole('link', { name: /Call dentist/ }), 200)

  expect(
    await screen.findByText('Something went wrong. Try again in a moment.'),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Call dentist/ })).toBeInTheDocument()
})

test('done reminders: swipe left deletes them too; swipe right does nothing', async () => {
  const card = aReminder({ title: 'Buy card', status: 'done', doneAt: new Date().toISOString() })
  mockReminders({ upcoming: [aReminder({ title: 'Book a plumber' })], done: [card] })
  const sentDone = jest.fn()
  const deleted: string[] = []
  server.use(
    http.post('*/api/v1/reminders/:id/done', sentDone),
    http.delete(`*/api/v1/reminders/${card.id}`, () => {
      deleted.push(card.id)
      mockReminders({ upcoming: [aReminder({ title: 'Book a plumber' })] })
      return new HttpResponse(null, { status: 204 })
    }),
  )
  openList()

  const tiles = await screen.findByRole('group', { name: 'Filter reminders' })
  fireEvent.click(await within(tiles).findByRole('button', { name: 'Done' }))
  const row = await screen.findByRole('link', { name: /Buy card/ })

  swipe(row, 200)
  await new Promise((resolve) => setTimeout(resolve, 300))
  expect(sentDone).not.toHaveBeenCalled()

  swipe(row, -200)
  await waitFor(() => expect(deleted).toEqual([card.id]))
  expect(await screen.findByText("Gone. We'll pretend it never happened.")).toBeInTheDocument()
})
