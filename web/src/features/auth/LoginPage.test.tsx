import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
  IPHONE_15_7,
  IPHONE_17,
  offerInstall,
  pretendInstalled,
  pretendUserAgent,
  resetDevice,
} from '../../test-utils/device'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { mockMe, renderApp } from '../../test-utils/renderApp'

// Every test starts as a desktop tab with no install offer (see src/test-utils/device.ts).
afterEach(resetDevice)

describe('signed-in pages (route guard)', () => {
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

  it('if the session ends by itself (not Sign out), /login still remembers the page', async () => {
    mockMe()
    const client = new FakeAuthClient(tester)
    const router = renderApp('/settings', client)
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()

    act(() => client.emit(null)) // Firebase: nobody signed in any more

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toEqual({ next: '/settings' })
  })
})

describe('LoginPage', () => {
  it('has one "rud." (no TopBar) and the Google button', async () => {
    pretendInstalled()
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

    // A TanStack mutation updates a moment after the click.
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'))
  })

  it('coming Back from Google (page restored from the browser cache): the button works again', async () => {
    const client = new FakeAuthClient(null)
    renderApp('/login', client)
    const button = await screen.findByRole('button', { name: 'Continue with Google' })
    client.signIn = () => new Promise(() => {}) // the page "leaves" for Google
    fireEvent.click(button)
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'))

    // The browser un-freezes the page: pageshow with persisted = true.
    const restored = new Event('pageshow')
    Object.defineProperty(restored, 'persisted', { value: true })
    act(() => {
      window.dispatchEvent(restored)
    })

    await waitFor(() => expect(button).not.toHaveAttribute('aria-busy'))
    expect(button).not.toHaveAttribute('aria-disabled')
  })

  it('after sign-in goes to `next`, including its query', async () => {
    mockMe()
    const router = renderApp('/login?next=%2Fr%2Fabc%3Ftab%3Ddone', new FakeAuthClient(tester))

    await waitFor(() => expect(router.state.location.pathname).toBe('/r/abc'))
    expect(router.state.location.search).toEqual({ tab: 'done' })
  })

  it('ignores a `next` that points to another site and goes home', async () => {
    mockMe()
    const router = renderApp('/login?next=%2F%2Fevil.example', new FakeAuthClient(tester))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('shows the sign-in error inline, with Try again', async () => {
    const client = new FakeAuthClient(null)
    client.pendingRedirectError = new Error('auth/network-request-failed')
    renderApp('/login', client)

    expect(await screen.findByRole('alert')).toHaveTextContent(/^Sign-in failed/)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(client.signInCalls).toBe(1))
  })

  it('not invited: shows the email that tried, and no sign-in button', async () => {
    mockMe(403, { error: { code: 'not_invited', message: 'this app is invite-only' } })
    renderApp('/login', new FakeAuthClient(tester))

    expect(
      await screen.findByRole('heading', { name: 'This app is invite-only.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('tester@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Google|Try again/ })).not.toBeInTheDocument()
  })
})

describe('LoginPage: the install gate (design doc §0)', () => {
  const openLogin = () => renderApp('/login', new FakeAuthClient(null))

  it('installed: sign-in only, no install', async () => {
    pretendInstalled()
    openLogin()

    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument()
  })

  it('iPhone in Safari: the Add to Home Screen steps, and no sign-in at all', async () => {
    pretendUserAgent(IPHONE_17)
    openLogin()

    const steps = await screen.findByRole('region', { name: 'Install on your iPhone first' })
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((step) => step.textContent),
    ).toEqual([
      '1Tap the Share button in Safari',
      '2Tap Add to Home Screen',
      '3Open rud. from your Home Screen',
    ])
    expect(screen.getByText(/Sign-in available after installing/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
  })

  it('the installed app on an iPhone: sign-in', async () => {
    pretendUserAgent(IPHONE_17)
    pretendInstalled()
    openLogin()

    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })

  it('iOS before 16.4: a hard stop with the version, nothing else', async () => {
    pretendUserAgent(IPHONE_15_7)
    openLogin()

    expect(
      await screen.findByRole('heading', { name: "You'll need iOS 16.4 or later." }),
    ).toBeInTheDocument()
    expect(screen.getByText('Your version: iOS 15.7')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('Chrome offers to install: Install app first, sign-in below; installing says what next', async () => {
    openLogin()
    const event = offerInstall('accepted')

    const install = await screen.findByRole('button', { name: 'Install app' })
    expect(screen.getByText('or, if already installed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()

    fireEvent.click(install)

    expect(
      await screen.findByText('Installed. Open rud. from your home screen.'),
    ).toBeInTheDocument()
    expect(event.prompted).toBe(1)
    expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument()
  })

  it('no install offer (another browser, or a dismissed one): sign-in, and how to install', async () => {
    openLogin()

    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Push notifications need the installed app. Install rud. from your browser menu.',
      ),
    ).toBeInTheDocument()
  })
})
