import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { ewa, FakeAuthClient } from '../../test-utils/fakeAuthClient'
import { mockMe, renderApp } from '../../test-utils/renderApp'

describe('signed-in pages (RequireAuth)', () => {
  it('shows the splash while Firebase is still checking', async () => {
    const client = new FakeAuthClient()
    client.emitOnSubscribe = false
    renderApp('/settings', client)

    expect(await screen.findByText('Checking your session…')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session…')
  })

  it('sends signed-out visitors to /login and remembers where they were going', async () => {
    const router = renderApp('/r/abc?tab=done', new FakeAuthClient(null))

    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({ next: '/r/abc?tab=done' })
  })
})

describe('LoginPage', () => {
  it('has one "rud." (no TopBar) and the Google button', async () => {
    renderApp('/login', new FakeAuthClient(null))

    expect(await screen.findByRole('heading', { level: 1, name: 'rud.' })).toBeInTheDocument()
    expect(screen.getAllByText('rud.')).toHaveLength(1)
    expect(screen.queryByRole('link', { name: /your reminders/ })).not.toBeInTheDocument()
    expect(screen.getByText('rud. is invite-only.')).toBeInTheDocument()
  })

  it('Continue with Google starts the Google sign-in and keeps the button busy', async () => {
    const client = new FakeAuthClient(null)
    renderApp('/login', client)

    const button = await screen.findByRole('button', { name: 'Continue with Google' })
    client.signIn = () => new Promise(() => {}) // the page would now leave for Google
    fireEvent.click(button)

    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('coming Back from Google (page restored from the browser cache): the button works again', async () => {
    const client = new FakeAuthClient(null)
    renderApp('/login', client)
    const button = await screen.findByRole('button', { name: 'Continue with Google' })
    client.signIn = () => new Promise(() => {}) // the page "leaves" for Google
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-busy', 'true')

    // The browser un-freezes the page: pageshow with persisted = true.
    const restored = new Event('pageshow')
    Object.defineProperty(restored, 'persisted', { value: true })
    act(() => {
      window.dispatchEvent(restored)
    })

    expect(button).not.toHaveAttribute('aria-busy')
    expect(button).not.toHaveAttribute('aria-disabled')
  })

  it('after sign-in goes to `next`, including its query', async () => {
    mockMe()
    const router = renderApp('/login?next=%2Fr%2Fabc%3Ftab%3Ddone', new FakeAuthClient(ewa))

    await waitFor(() => expect(router.state.location.pathname).toBe('/r/abc'))
    expect(router.state.location.search).toEqual({ tab: 'done' })
  })

  it('ignores a `next` that points to another site and goes home', async () => {
    mockMe()
    const router = renderApp('/login?next=%2F%2Fevil.example', new FakeAuthClient(ewa))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('shows the sign-in error inline, with Try again', async () => {
    const client = new FakeAuthClient(null)
    client.pendingRedirectError = new Error('auth/network-request-failed')
    renderApp('/login', client)

    expect(await screen.findByRole('alert')).toHaveTextContent(/^Sign-in failed/)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(client.signInCalls).toBe(1)
  })

  it('not invited: shows the email that tried, and no sign-in button', async () => {
    mockMe(403, { error: { code: 'not_invited', message: 'this app is invite-only' } })
    renderApp('/login', new FakeAuthClient(ewa))

    expect(
      await screen.findByRole('heading', { name: 'This app is invite-only.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('ewa.wrobel@gmail.com')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Google|Try again/ })).not.toBeInTheDocument()
  })
})
