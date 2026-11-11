import { onlineManager } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { pretendDeviceId, resetDevice } from '../../test-utils/device'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { FakePushClient } from '../../test-utils/fakePushClient'
import { mockMe, renderApp, testMe } from '../../test-utils/renderApp'

/** Opens the Sign out sheet and confirms it. */
async function confirmSignOut() {
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
  const sheet = await screen.findByRole('alertdialog', { name: 'Sign out?' })
  const confirm = screen.getAllByRole('button', { name: 'Sign out' }).find((b) => sheet.contains(b))
  fireEvent.click(confirm!)
}

describe('SettingsPage', () => {
  beforeEach(() => mockMe())
  afterEach(resetDevice)

  it('shows who is signed in', async () => {
    renderApp('/settings', new FakeAuthClient(tester))

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Tess')).toBeInTheDocument()
    // No Settings icon on Settings itself: ‹ Back and the logo lead away.
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    expect(screen.getByText('tester@example.com')).toBeInTheDocument()
  })

  it('links to the privacy notice, a page outside the app', async () => {
    renderApp('/settings', new FakeAuthClient(tester))

    const link = await screen.findByRole('link', { name: 'Privacy' })
    expect(link).toHaveAttribute('href', '/privacy.html')
  })

  it("shows the API's email (GET /me), not only Google's", async () => {
    mockMe(200, { ...testMe, email: 'api@example.com' })
    renderApp('/settings', new FakeAuthClient(tester))

    expect(await screen.findByText('api@example.com')).toBeInTheDocument()
  })

  it('falls back to the email when Google has no name', async () => {
    renderApp('/settings', new FakeAuthClient({ email: 'tester@example.com', name: null }))

    expect(await screen.findAllByText('tester@example.com')).toHaveLength(2)
  })

  it('Sign out asks first, then signs out and goes to /login', async () => {
    const client = new FakeAuthClient(tester)
    const router = renderApp('/settings', client)

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    const sheet = await screen.findByRole('alertdialog', { name: 'Sign out?' })
    expect(sheet).toHaveTextContent(
      "No notifications on this device until you're back. Anything that fires meanwhile goes straight to Overdue. We'll pretend not to notice.",
    )
    expect(sheet).not.toHaveTextContent('reinstall')
    expect(client.signOutCalls).toBe(0)

    const confirm = screen
      .getAllByRole('button', { name: 'Sign out' })
      .find((b) => sheet.contains(b))
    fireEvent.click(confirm!)

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    // The plain login page: signing back in starts on the list, not back in Settings.
    expect(router.state.location.search).toEqual({})
    expect(client.signOutCalls).toBe(1)
  })

  it('Sign out removes this device and its push token first, and forgets the device here', async () => {
    pretendDeviceId('d1')
    const client = new FakeAuthClient(tester)
    const push = new FakePushClient()
    const deleted: { id: string | undefined; signedOutYet: number }[] = []
    server.use(
      http.delete('*/api/v1/devices/:id', ({ params }) => {
        // Still signed in: the API call needs the sign-in token.
        deleted.push({ id: String(params.id), signedOutYet: client.signOutCalls })
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const router = renderApp('/settings', client, push)

    await confirmSignOut()

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(deleted).toEqual([{ id: 'd1', signedOutYet: 0 }])
    expect(push.deleteTokenCalls).toBe(1)
    expect(localStorage.getItem('rud.deviceId')).toBeNull()
    expect(client.signOutCalls).toBe(1)
  })

  it('the API refuses (or the network fails): still signs out, and keeps the id for next time', async () => {
    pretendDeviceId('d1')
    server.use(http.delete('*/api/v1/devices/:id', () => HttpResponse.error()))
    const client = new FakeAuthClient(tester)
    const router = renderApp('/settings', client)

    await confirmSignOut()

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(client.signOutCalls).toBe(1)
    // The API may still have it: signing back in should see "this device", not "another".
    expect(localStorage.getItem('rud.deviceId')).toBe('d1')
  })

  it('the device already left the API (404, another device took over): forgets it', async () => {
    pretendDeviceId('d1')
    server.use(
      http.delete('*/api/v1/devices/:id', () =>
        HttpResponse.json({ error: { code: 'not_found', message: 'Not found' } }, { status: 404 }),
      ),
    )
    const client = new FakeAuthClient(tester)
    const router = renderApp('/settings', client)

    await confirmSignOut()

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(localStorage.getItem('rud.deviceId')).toBeNull()
  })

  it('no device on this browser: no DELETE, still deletes any push token', async () => {
    // No handler for DELETE /devices: a request would fail the test.
    const client = new FakeAuthClient(tester)
    const push = new FakePushClient()
    const router = renderApp('/settings', client, push)

    await confirmSignOut()

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(push.deleteTokenCalls).toBe(1)
    expect(client.signOutCalls).toBe(1)
  })

  it('signs out even while offline (Firebase needs no connection for it)', async () => {
    const client = new FakeAuthClient(tester)
    const router = renderApp('/settings', client)
    const signOut = await screen.findByRole('button', { name: 'Sign out' })
    onlineManager.setOnline(false) // the signal drops while the page is open
    try {
      fireEvent.click(signOut)
      const sheet = await screen.findByRole('alertdialog', { name: 'Sign out?' })
      const confirm = screen
        .getAllByRole('button', { name: 'Sign out' })
        .find((b) => sheet.contains(b))
      fireEvent.click(confirm!)

      await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
      expect(client.signOutCalls).toBe(1)
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('Cancel keeps you signed in', async () => {
    const client = new FakeAuthClient(tester)
    renderApp('/settings', client)

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(client.signOutCalls).toBe(0)
  })
})
