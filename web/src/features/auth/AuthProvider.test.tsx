import { act, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import type { User } from '../../lib/api/generated/model'
import { server } from '../../mocks/server'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { TestQueryProvider } from '../../test-utils/TestQueryProvider'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'
import { useMe } from './useMe'

const me: User = {
  id: 'u1',
  email: 'tester@example.com',
  timezone: 'UTC',
  defaultTimeOfDay: '09:00',
  defaultNagIntervalMin: 60,
}

type Call = { path: string; method: string; auth: string | null; body: unknown }
let calls: Call[]

/** Fake API (MSW): GET /me answers `getMe`, PATCH /me echoes the new time zone. */
function mockApi(getMe: { status: number; body: JsonBodyType }) {
  calls = []
  const record = async (request: Request) => {
    const body: unknown = request.method === 'PATCH' ? await request.clone().json() : undefined
    const path = new URL(request.url).pathname
    calls.push({ path, method: request.method, auth: request.headers.get('Authorization'), body })
    return body
  }
  server.use(
    http.get('*/api/v1/me', async ({ request }) => {
      await record(request)
      return HttpResponse.json(getMe.body, { status: getMe.status })
    }),
    http.patch('*/api/v1/me', async ({ request }) => {
      const body = await record(request)
      const tz =
        typeof body === 'object' && body !== null ? Reflect.get(body, 'timezone') : undefined
      return HttpResponse.json({ ...me, timezone: typeof tz === 'string' ? tz : me.timezone })
    }),
  )
}

function Show() {
  const { state } = useAuth()
  const user = useMe()
  return (
    <p>
      {state.status}
      {state.status === 'signedIn' && user ? ` ${user.timezone}` : ''}
      {state.status === 'notInvited' ? ` ${state.email}` : ''}
      {state.status === 'signedOut' && state.error ? ` error: ${state.error}` : ''}
    </p>
  )
}

function renderAuth(client: FakeAuthClient) {
  return render(
    <TestQueryProvider>
      <AuthProvider client={client}>
        <Show />
      </AuthProvider>
    </TestQueryProvider>,
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
    renderAuth(new FakeAuthClient(tester))

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
    renderAuth(new FakeAuthClient(tester))

    expect(await screen.findByText('signedIn Europe/Stockholm')).toBeInTheDocument()
    expect(calls.map((c) => c.method)).toEqual(['GET'])
  })

  it('not invited: shows who tried, and signs them out of Firebase', async () => {
    mockApi({ status: 403, body: { error: { code: 'not_invited', message: 'invite-only' } } })
    const client = new FakeAuthClient(tester)
    renderAuth(client)

    expect(await screen.findByText('notInvited tester@example.com')).toBeInTheDocument()
    await waitFor(() => expect(client.signOutCalls).toBe(1))
    // The sign-out event must not replace the invite-only screen.
    expect(screen.getByText('notInvited tester@example.com')).toBeInTheDocument()
  })

  it('API down: signed out with a message, Firebase session ended', async () => {
    mockApi({ status: 500, body: { error: { code: 'internal', message: 'x' } } })
    const client = new FakeAuthClient(tester)
    renderAuth(client)

    expect(await screen.findByText(/^signedOut error: Sign-in failed/)).toBeInTheDocument()
    await waitFor(() => expect(client.signOutCalls).toBe(1))
  })

  it('offline: shows the connection message but keeps the Firebase session', async () => {
    server.use(http.get('*/api/v1/me', () => HttpResponse.error()))
    const client = new FakeAuthClient(tester)
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

  it('sign-out clears the cache: the next sign-in asks the API again', async () => {
    mockApi({ status: 200, body: { ...me, timezone: 'Europe/Stockholm' } })
    const client = new FakeAuthClient(tester)
    renderAuth(client)
    await screen.findByText('signedIn Europe/Stockholm')

    act(() => client.emit(null))
    act(() => client.emit(tester))

    await screen.findByText('signedIn Europe/Stockholm')
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET'])
  })

  it('another user right after the first (no sign-out between): asks the API again', async () => {
    mockApi({ status: 200, body: { ...me, timezone: 'Europe/Stockholm' } })
    const client = new FakeAuthClient(tester)
    renderAuth(client)
    await screen.findByText('signedIn Europe/Stockholm')

    act(() => client.emit({ email: 'other@example.com', name: 'Otto' }))

    await waitFor(() => expect(calls.map((c) => c.method)).toEqual(['GET', 'GET']))
  })

  it('follows Firebase when the user signs out later', async () => {
    mockApi({ status: 200, body: { ...me, timezone: 'Europe/Stockholm' } })
    const client = new FakeAuthClient(tester)
    renderAuth(client)
    await screen.findByText('signedIn Europe/Stockholm')

    act(() => client.emit(null))
    expect(screen.getByText('signedOut')).toBeInTheDocument()
  })
})
