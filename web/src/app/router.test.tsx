import { Link } from '@tanstack/react-router'
import { screen } from '@testing-library/react'
import { ewa, FakeAuthClient } from '../test-utils/fakeAuthClient'
import { mockMe, renderApp } from '../test-utils/renderApp'

beforeEach(() => mockMe())

test.each([
  ['/', 'Your reminders'],
  ['/r/123', 'Reminder'],
  ['/settings', 'Settings'],
])('%s shows "%s" when signed in', async (path, heading) => {
  renderApp(path, new FakeAuthClient(ewa))

  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
})

test('/login shows the wordmark and no Settings link (nobody is signed in)', async () => {
  renderApp('/login', new FakeAuthClient(null))

  expect(await screen.findByRole('heading', { level: 1, name: 'rud.' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
})

test('an unknown URL shows the 404 page, signed in or not', async () => {
  renderApp('/no-such-page', new FakeAuthClient(null))

  expect(await screen.findByRole('heading', { name: 'Nothing here.' })).toBeInTheDocument()
})

test('the 404 page has a full-size "Go home" link', async () => {
  renderApp('/no-such-page', new FakeAuthClient(null))

  expect(await screen.findByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/')
})

// Compile-time check: the page() helper must keep links type-checked.
// If types were lost, the @ts-expect-error lines would be "unused" and the type check would fail.
test('links to routes are type-checked', () => {
  const ok = (
    <Link to="/r/$id" params={{ id: '123' }}>
      Reminder
    </Link>
  )
  // @ts-expect-error: no such route
  const unknownRoute = <Link to="/nope">Nope</Link>
  // @ts-expect-error: /r/$id needs its id param
  const missingParam = <Link to="/r/$id">Reminder</Link>

  expect([ok, unknownRoute, missingParam]).toHaveLength(3)
})
