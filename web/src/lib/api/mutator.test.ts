import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/server'
import { deleteMe, getMe, updateMe } from './generated/user/user'
import { ApiError, setTokenSource } from './mutator'

const me = {
  id: 'u1',
  email: 'tester@example.com',
  timezone: 'UTC',
  defaultTimeOfDay: '09:00',
  defaultNagIntervalMin: 60,
}

/** Answers every /api/v1/me call with `status` + `body`, and remembers the requests. */
function answer(status: number, body: JsonBodyType) {
  const requests: Request[] = []
  const reply = ({ request }: { request: Request }) => {
    requests.push(request.clone())
    return HttpResponse.json(body, { status })
  }
  server.use(http.get('*/api/v1/me', reply), http.patch('*/api/v1/me', reply))
  return requests
}

beforeEach(() => setTokenSource(() => Promise.resolve('tok')))

describe('apiFetch (every generated API call goes through it)', () => {
  it('calls /api/v1/... with the sign-in token', async () => {
    const requests = answer(200, me)

    await expect(getMe()).resolves.toEqual(me)
    expect(new URL(requests[0]?.url ?? '').pathname).toBe('/api/v1/me')
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer tok')
  })

  it('sends no Authorization header when nobody is signed in', async () => {
    setTokenSource(() => Promise.resolve(null))
    const requests = answer(200, me)

    await getMe()
    expect(requests[0]?.headers.has('Authorization')).toBe(false)
  })

  it('PATCH sends a JSON body', async () => {
    const requests = answer(200, { ...me, timezone: 'Europe/Stockholm' })

    await expect(updateMe({ timezone: 'Europe/Stockholm' })).resolves.toMatchObject({
      timezone: 'Europe/Stockholm',
    })
    expect(requests[0]?.method).toBe('PATCH')
    expect(requests[0]?.headers.get('Content-Type')).toBe('application/json')
    await expect(requests[0]?.json()).resolves.toEqual({ timezone: 'Europe/Stockholm' })
  })

  it('an empty answer (204 No Content) resolves without a body', async () => {
    server.use(http.delete('*/api/v1/me', () => new HttpResponse(null, { status: 204 })))

    await expect(deleteMe()).resolves.toBeNull()
  })

  it("turns the API's error shape into an ApiError", async () => {
    answer(403, { error: { code: 'not_invited', message: 'this app is invite-only' } })

    const err = await getMe().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      status: 403,
      code: 'not_invited',
      message: 'this app is invite-only',
    })
  })

  it('still gives an ApiError when the body is not JSON', async () => {
    server.use(
      http.get('*/api/v1/me', () => new HttpResponse('<html>Bad gateway', { status: 502 })),
    )

    await expect(getMe()).rejects.toMatchObject({ status: 502, code: 'http_502' })
  })

  it('marks a request that never reached the server as a network error', async () => {
    server.use(http.get('*/api/v1/me', () => HttpResponse.error()))

    await expect(getMe()).rejects.toMatchObject({ status: 0, code: 'network' })
  })
})
