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
  // Said once, in the middle: no second line under the top bar.
  expect(screen.queryByText('Nothing nagging you yet.')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add reminder' })).toBeInTheDocument()
  expect(screen.queryByRole('group', { name: 'Filter reminders' })).not.toBeInTheDocument()
})

test('only done ones left: the tiles stay (Done one tap away), with the warm empty state', async () => {
  mockReminders({ upcoming: [], done: [aReminder({ title: 'Paid rent', status: 'done' })] })
  openList()

  expect(
    await screen.findByRole('heading', { name: /Suspiciously productive/ }),
  ).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Filter reminders' })).toBeInTheDocument()
  expect(screen.queryByText('Nothing here right now.')).not.toBeInTheDocument()

  // Done is one tap away.
  fireEvent.click(screen.getByRole('button', { name: /^Done/ }))
  expect(await screen.findByRole('link', { name: /Paid rent/ })).toBeInTheDocument()
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

  // No context line when there are reminders (Inventory): the tiles start under the bar.
  expect(await screen.findByText('The full chaos')).toBeInTheDocument()
  expect(screen.queryByText(/need your attention/)).not.toBeInTheDocument()
  const tiles = screen.getByRole('group', { name: 'Filter reminders' })
  expect(within(tiles).getByRole('button', { name: 'Waiting 1' })).toBeInTheDocument()
  expect(within(tiles).getByRole('button', { name: 'Nagging 1' })).toBeInTheDocument()
  expect(within(tiles).getByRole('button', { name: 'Overdue 1' })).toBeInTheDocument()
  expect(await within(tiles).findByRole('button', { name: 'Done' })).toBeInTheDocument()

  // No tile: all active, no done ones.
  const list = screen.getByRole('list', { name: 'Active reminders' })
  expect(within(list).getAllByRole('link')).toHaveLength(3)

  // The picked tile goes into the address (/?show=nagging); the list follows a moment later.
  fireEvent.click(within(tiles).getByRole('button', { name: 'Nagging 1' }))
  await waitFor(() =>
    expect(
      within(screen.getByRole('list'))
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual([expect.stringContaining('Call dentist')]),
  )

  fireEvent.click(within(tiles).getByRole('button', { name: 'Done' }))
  expect(await screen.findByRole('link', { name: /Buy card/ })).toBeInTheDocument()

  fireEvent.click(within(tiles).getByRole('button', { name: 'Done' }))
  expect(
    within(await screen.findByRole('list', { name: 'Active reminders' })).getAllByRole('link'),
  ).toHaveLength(3)
})

test('the list puts overdue first, then nagging, then waiting (decision 64)', async () => {
  // The API sends the soonest due first; the screen sorts by what needs you most.
  mockReminders({
    upcoming: [
      aReminder({ title: 'Book a plumber' }),
      aReminder({ title: 'Call dentist', status: 'sent', nagCount: 2 }),
      aReminder({ title: 'Reply to landlord', status: 'sent', nagCount: 5 }),
      aReminder({ title: 'Renew passport', status: 'sent', nagCount: 12, nagsExhausted: true }),
    ],
  })
  openList()

  const list = await screen.findByRole('list', { name: 'Active reminders' })
  expect(
    within(list)
      .getAllByRole('link')
      .map((l) => l.textContent),
  ).toEqual([
    expect.stringContaining('Renew passport'),
    expect.stringContaining('Reply to landlord'),
    expect.stringContaining('Call dentist'),
    expect.stringContaining('Book a plumber'),
  ])

  // A picked tile keeps the order: the most pushes first.
  fireEvent.click(screen.getByRole('button', { name: 'Nagging 2' }))
  await waitFor(() =>
    expect(
      within(screen.getByRole('list'))
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual([
      expect.stringContaining('Reply to landlord'),
      expect.stringContaining('Call dentist'),
    ]),
  )
})

test('the picked tile is in the address: Back from a reminder keeps it', async () => {
  mockReminders({
    upcoming: [
      aReminder({ title: 'Book a plumber' }),
      aReminder({ title: 'Call dentist', status: 'sent', nagCount: 2 }),
    ],
  })
  const router = openList()

  const tiles = await screen.findByRole('group', { name: 'Filter reminders' })
  fireEvent.click(within(tiles).getByRole('button', { name: 'Nagging 1' }))
  await waitFor(() => expect(router.state.location.search).toEqual({ show: 'nagging' }))

  fireEvent.click(screen.getByRole('link', { name: /Call dentist/ }))
  await waitFor(() => expect(router.state.location.pathname).not.toBe('/'))
  router.history.back()

  await waitFor(() => expect(router.state.location.search).toEqual({ show: 'nagging' }))
  expect(await screen.findByRole('list', { name: 'nagging reminders' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Book a plumber/ })).not.toBeInTheDocument()
})

test('a made-up filter in the address is ignored', async () => {
  mockReminders({ upcoming: [aReminder({ title: 'Book a plumber' })] })
  renderApp('/?show=everything', new FakeAuthClient(tester))

  expect(await screen.findByRole('list', { name: 'Active reminders' })).toBeInTheDocument()
})

test('names every JavaScript object has are not filters either (?show=constructor)', async () => {
  mockReminders({ upcoming: [aReminder({ title: 'Book a plumber' })] })
  const router = renderApp('/?show=constructor', new FakeAuthClient(tester))

  expect(await screen.findByRole('list', { name: 'Active reminders' })).toBeInTheDocument()
  expect(router.state.location.search).toEqual({})
})

test('the Done tile has no number; the done list loads only when it is tapped', async () => {
  const done = Array.from({ length: 3 }, (_, k) =>
    aReminder({ title: `Done ${k}`, status: 'done', doneAt: new Date().toISOString() }),
  )
  const asked = mockReminders({ upcoming: [aReminder()], done })
  openList()

  const doneTile = await screen.findByRole('button', { name: 'Done' })
  // On open: the active list, and 1 done reminder to know there are any.
  expect(asked.sort()).toEqual(['status=done&limit=1', 'status=upcoming'])

  fireEvent.click(doneTile)
  expect(await screen.findAllByRole('link', { name: /Done \d/ })).toHaveLength(3)
  expect(asked).toContain('status=done')
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
  mockReminders({ upcoming: [aReminder({ title: 'Back again' })] })
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(screen.getByRole('link', { name: /Back again/ })).toBeInTheDocument())
})

test('too many requests: the list says to slow down, not just try again', async () => {
  server.use(
    http.get('*/api/v1/reminders', () =>
      HttpResponse.json(
        { error: { code: 'rate_limited', message: 'x' } },
        { status: 429, headers: { 'Retry-After': '30' } },
      ),
    ),
  )
  openList()

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Slow down a little. Try again in a minute.',
  )
})
