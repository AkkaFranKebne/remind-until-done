import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { aReminder, mockReminders } from '../../test-utils/reminders'
import { mockMe, renderApp } from '../../test-utils/renderApp'

beforeEach(() => mockMe())

const openList = () => renderApp('/', new FakeAuthClient(tester))

test('shows skeleton rows while the list loads for the first time', async () => {
  mockReminders({ upcoming: [aReminder({ title: 'Call dentist' })] })
  openList()

  expect(await screen.findByLabelText('Loading reminders')).toHaveAttribute('aria-busy', 'true')
  expect(await screen.findByRole('link', { name: /Call dentist/ })).toBeInTheDocument()
  expect(screen.queryByLabelText('Loading reminders')).not.toBeInTheDocument()
})

test('empty: the warm empty state, the + button, no tiles', async () => {
  openList()

  expect(
    await screen.findByRole('heading', { name: /Suspiciously productive/ }),
  ).toBeInTheDocument()
  expect(screen.getByText('Nothing nagging you yet.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add reminder' })).toBeInTheDocument()
  expect(screen.queryByRole('group', { name: 'Filter reminders' })).not.toBeInTheDocument()
})

test('tiles count by status and filter the list; tapping the picked tile shows all again', async () => {
  mockReminders({
    upcoming: [
      aReminder({ title: 'Book a plumber' }),
      aReminder({ title: 'Call dentist', status: 'sent', nagCount: 2 }),
      aReminder({ title: 'Renew passport', status: 'sent', nagCount: 12, nagsExhausted: true }),
    ],
    done: [aReminder({ title: 'Buy card', status: 'done', doneAt: new Date().toISOString() })],
  })
  openList()

  expect(await screen.findByText('2 things need your attention.')).toBeInTheDocument()
  const tiles = screen.getByRole('group', { name: 'Filter reminders' })
  expect(within(tiles).getByRole('button', { name: 'Waiting 1' })).toBeInTheDocument()
  expect(within(tiles).getByRole('button', { name: 'Nagging 1' })).toBeInTheDocument()
  expect(within(tiles).getByRole('button', { name: 'Overdue 1' })).toBeInTheDocument()
  expect(await within(tiles).findByRole('button', { name: 'Done 1' })).toBeInTheDocument()

  // No tile: all active, no done ones.
  const list = screen.getByRole('list', { name: 'Active reminders' })
  expect(within(list).getAllByRole('link')).toHaveLength(3)

  fireEvent.click(within(tiles).getByRole('button', { name: 'Nagging 1' }))
  expect(
    within(screen.getByRole('list'))
      .getAllByRole('link')
      .map((l) => l.textContent),
  ).toEqual([expect.stringContaining('Call dentist')])

  fireEvent.click(within(tiles).getByRole('button', { name: 'Done 1' }))
  expect(screen.getByRole('link', { name: /Buy card/ })).toBeInTheDocument()

  fireEvent.click(within(tiles).getByRole('button', { name: 'Done 1' }))
  expect(
    within(screen.getByRole('list', { name: 'Active reminders' })).getAllByRole('link'),
  ).toHaveLength(3)
})

test('more than one page of done reminders: the tile says 50+', async () => {
  const done = Array.from({ length: 50 }, () =>
    aReminder({ status: 'done', doneAt: new Date().toISOString() }),
  )
  mockReminders({ upcoming: [aReminder()], done, doneNextCursor: 'next' })
  openList()

  expect(await screen.findByRole('button', { name: 'Done 50+' })).toBeInTheDocument()
})

test('at 5 active the + button hides and a note says why', async () => {
  mockReminders({ upcoming: Array.from({ length: 5 }, () => aReminder()) })
  openList()

  expect(await screen.findByText(/You've hit 5 active reminders/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add reminder' })).not.toBeInTheDocument()
})

test('if the list fails to load: a message and Try again', async () => {
  server.use(
    http.get('*/api/v1/reminders', () =>
      HttpResponse.json({ error: { code: 'internal', message: 'x' } }, { status: 500 }),
    ),
  )
  openList()

  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your reminders.")
  expect(screen.queryByText('Nothing nagging you yet.')).not.toBeInTheDocument()
  mockReminders({ upcoming: [aReminder({ title: 'Back again' })] })
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(screen.getByRole('link', { name: /Back again/ })).toBeInTheDocument())
})
