import { act, render, screen, waitFor } from '@testing-library/react'
import { setHttp, type Me } from '../../lib/api/client'
import { ewa, FakeAuthClient } from '../../test-utils/fakeAuthClient'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'

const me: Me = {
  id: 'u1',
  email: 'ewa.wrobel@gmail.com',
  timezone: 'UTC',
  defaultTimeOfDay: '09:00',
  defaultNagIntervalMin: 60,
}

type Call = { path: string; method: string; auth: string | null; body: unknown }
let calls: Call[]

/** Fake API: GET /me answers `getMe`, PATCH /me echoes the new time zone. */
function mockApi(getMe: { status: number; body: unknown }) {
  calls = []
  setHttp((url, init) => {
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    const auth = new Headers(init.headers).get('Authorization')
    calls.push({ path: url, method: init.method ?? 'GET', auth, body })
    const tz = typeof body === 'object' && body !== null ? Reflect.get(body, 'timezone') : undefined
    const res =
      init.method === 'PATCH'
        ? { status: 200, body: { ...me, timezone: typeof tz === 'string' ? tz : me.timezone } }
        : getMe
    return Promise.resolve({
      ok: res.status < 400,
      status: res.status,
      json: () => Promise.resolve(res.body),
    })
  })
}

function Show() {
  const { state } = useAuth()
  return (
    <p>
      {state.status}
      {state.status === 'signedIn' ? ` ${state.me.timezone}` : ''}
      {state.status === 'notInvited' ? ` ${state.email}` : ''}
      {state.status === 'signedOut' && state.error ? ` error: ${state.error}` : ''}
    </p>
  )
}

function renderAuth(client: FakeAuthClient) {
  return render(
    <AuthProvider client={client}>
      <Show />
    </AuthProvider>,
  )
}

let tz: jest.SpyInstance
beforeEach(() => {
  const real = new Intl.DateTimeFormat().resolvedOptions()
  tz = jest
    .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
    .mockReturnValue({ ...real, timeZone: 'Europe/Stockholm' })
})
afterEach(() => tz.mockRestore())

describe('AuthProvider', () => {
  it('stays "checking" until Firebase answers', () => {
    const client = new FakeAuthClient()
    client.emitOnSubscribe = false
    renderAuth(client)
    expect(screen.getByText('checking')).toBeInTheDocument()
  })

  it('is signed out when nobody is signed in, without calling the API', () => {
    mockApi({ status: 200, body: me })
    renderAuth(new FakeAuthClient(null))
    expect(screen.getByText('signedOut')).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('signs in: GET /me with the token, then sends the phone time zone', async () => {
    mockApi({ status: 200, body: me })
    renderAuth(new FakeAuthClient(ewa))

    expect(await screen.findByText('signedIn Europe/Stockholm')).toBeInTheDocument()
    expect(calls).toEqual([
      { path: '/api/v1/me', method: 'GET', auth: 'Bearer test-token', body: undefined },
      {
        path: '/api/v1/me',
        method: 'PATCH',
        auth: 'Bearer test-token',
        body: { timezone: 'Europe/Stockholm' },
      },
    ])
  })

  it('does not PATCH when the time zone already matches', async () => {
    mockApi({ status: 200, body: { ...me, timezone: 'Europe/Stockholm' } })
    renderAuth(new FakeAuthClient(ewa))

    expect(await screen.findByText('signedIn Europe/Stockholm')).toBeInTheDocument()
    expect(calls.map((c) => c.method)).toEqual(['GET'])
  })

  it('not invited: shows who tried, and signs them out of Firebase', async () => {
    mockApi({ status: 403, body: { error: { code: 'not_invited', message: 'invite-only' } } })
    const client = new FakeAuthClient(ewa)
    renderAuth(client)

    expect(await screen.findByText('notInvited ewa.wrobel@gmail.com')).toBeInTheDocument()
    await waitFor(() => expect(client.signOutCalls).toBe(1))
    // The sign-out event must not replace the invite-only screen.
    expect(screen.getByText('notInvited ewa.wrobel@gmail.com')).toBeInTheDocument()
  })

  it('API down: signed out with a message, Firebase session ended', async () => {
    mockApi({ status: 500, body: { error: { code: 'internal', message: 'x' } } })
    const client = new FakeAuthClient(ewa)
    renderAuth(client)

    expect(await screen.findByText(/^signedOut error: Sign-in failed/)).toBeInTheDocument()
    await waitFor(() => expect(client.signOutCalls).toBe(1))
  })

  it('offline: shows the connection message but keeps the Firebase session', async () => {
    setHttp(() => Promise.reject(new TypeError('Failed to fetch')))
    const client = new FakeAuthClient(ewa)
    renderAuth(client)

    expect(await screen.findByText(/^signedOut error: Can't reach the server/)).toBeInTheDocument()
    expect(client.signOutCalls).toBe(0)
  })

  it('shows the error when coming back from a failed Google sign-in', async () => {
    const client = new FakeAuthClient(null)
    client.pendingRedirectError = new Error('auth/network-request-failed')
    renderAuth(client)

    expect(await screen.findByText(/^signedOut error: Sign-in failed/)).toBeInTheDocument()
  })

  it('follows Firebase when the user signs out later', async () => {
    mockApi({ status: 200, body: { ...me, timezone: 'Europe/Stockholm' } })
    const client = new FakeAuthClient(ewa)
    renderAuth(client)
    await screen.findByText('signedIn Europe/Stockholm')

    act(() => client.emit(null))
    expect(screen.getByText('signedOut')).toBeInTheDocument()
  })
})
