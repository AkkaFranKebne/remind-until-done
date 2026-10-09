import { createMemoryHistory, Link, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { createAppRouter } from './router'

function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  render(<RouterProvider router={router} />)
}

test.each([
  ['/', 'Your reminders'],
  ['/r/123', 'Reminder'],
  ['/settings', 'Settings'],
  ['/login', 'Sign in'],
  ['/no-such-page', 'Nothing here.'],
])('%s shows "%s"', async (path, heading) => {
  renderAt(path)

  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
})

test('login page has no Settings link (nobody is signed in)', async () => {
  renderAt('/login')

  await screen.findByRole('heading', { name: 'Sign in' })
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
})

test('the 404 page has a full-size "Go home" link', async () => {
  renderAt('/no-such-page')

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
