import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { Reminder } from '../../lib/api/generated/model'
import { server } from '../../mocks/server'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { aReminder, mockReminders } from '../../test-utils/reminders'
import { mockMe, renderApp } from '../../test-utils/renderApp'

beforeEach(() => mockMe())

const ID = '00000000-0000-4000-8000-00000000abcd'

/** The fake API knows this one reminder, and Done works on it. */
function mockReminder(over: Partial<Reminder> = {}) {
  let current = aReminder({ id: ID, title: 'Call the bank', ...over })
  server.use(
    http.get(`*/api/v1/reminders/${ID}`, () => HttpResponse.json(current)),
    http.post(`*/api/v1/reminders/${ID}/done`, () => {
      current = { ...current, status: 'done', doneAt: new Date().toISOString() }
      return HttpResponse.json(current)
    }),
  )
}

const openPage = () => renderApp(`/r/${ID}`, new FakeAuthClient(tester))

/** A little longer than the done pause (2 s). In act: an open sheet keeps animating meanwhile. */
const pastThePause = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 2300)))

test('Done: after a moment the page leaves for the Done list', async () => {
  mockReminder({ status: 'sent', nagCount: 2 })
  mockReminders({ done: [aReminder({ id: ID, title: 'Call the bank', status: 'done' })] })
  // jsdom has no view transitions: this one just runs the page change, and counts.
  const startViewTransition = jest.fn((update: () => Promise<void>) => {
    const finished = update()
    return { finished, ready: finished, updateCallbackDone: finished }
  })
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: startViewTransition,
  })
  const router = openPage()

  fireEvent.click(await screen.findByRole('button', { name: 'Done' }))

  // The done state shows first...
  expect(await screen.findByText('Completed')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(`/r/${ID}`)
  // ...then the list, on the Done tile.
  await waitFor(() => expect(router.state.location.pathname).toBe('/'), { timeout: 4000 })
  expect(router.state.location.search).toEqual({ show: 'done' })
  expect(startViewTransition).toHaveBeenCalled()
  Reflect.deleteProperty(document, 'startViewTransition')
})

test('Done: a sheet opened in that moment holds the page', async () => {
  mockReminder({ status: 'sent', nagCount: 2 })
  const router = openPage()

  fireEvent.click(await screen.findByRole('button', { name: 'Done' }))
  await screen.findByText('Completed')
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

  await pastThePause()
  expect(router.state.location.pathname).toBe(`/r/${ID}`)
})

test('Done: the delete sheet holds the page too, and Keep it lets it leave', async () => {
  mockReminder({ status: 'sent', nagCount: 2 })
  mockReminders({ done: [aReminder({ id: ID, title: 'Call the bank', status: 'done' })] })
  const router = openPage()

  fireEvent.click(await screen.findByRole('button', { name: 'Done' }))
  await screen.findByText('Completed')
  const [trash] = screen.getAllByRole('button', { name: 'Delete' })
  if (!trash) throw new Error('no Delete button')
  fireEvent.click(trash)
  const sheet = await screen.findByRole('alertdialog', { name: 'Delete this reminder?' })

  await pastThePause()
  expect(router.state.location.pathname).toBe(`/r/${ID}`)

  fireEvent.click(within(sheet).getByRole('button', { name: 'Keep it' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/'), { timeout: 4000 })
}, 10_000)

test('a done reminder opened later stays open', async () => {
  mockReminder({ status: 'done', doneAt: new Date().toISOString() })
  const router = openPage()

  await screen.findByText('Completed')
  await pastThePause()
  expect(router.state.location.pathname).toBe(`/r/${ID}`)
})
