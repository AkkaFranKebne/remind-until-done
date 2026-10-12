import { ApiError, getMe, setHttp, updateMe, type Http, type HttpResponse } from './client'

const me = {
  id: 'u1',
  email: 'ewa@example.com',
  timezone: 'UTC',
  defaultTimeOfDay: '09:00',
  defaultNagIntervalMin: 60,
}

function answer(status: number, body: unknown): Promise<HttpResponse> {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

function fakeServer(impl: Http) {
  const fn = jest.fn<ReturnType<Http>, Parameters<Http>>(impl)
  setHttp(fn)
  return fn
}

describe('api client', () => {
  it('GET /api/v1/me with the token', async () => {
    const server = fakeServer(() => answer(200, me))

    await expect(getMe('tok')).resolves.toEqual(me)
    expect(server).toHaveBeenCalledWith('/api/v1/me', {
      method: 'GET',
      headers: { Authorization: 'Bearer tok' },
      body: undefined,
    })
  })

  it('PATCH sends a JSON body', async () => {
    const server = fakeServer(() => answer(200, { ...me, timezone: 'Europe/Stockholm' }))

    await expect(updateMe({ timezone: 'Europe/Stockholm' }, 't')).resolves.toMatchObject({
      timezone: 'Europe/Stockholm',
    })
    expect(server).toHaveBeenCalledWith('/api/v1/me', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: '{"timezone":"Europe/Stockholm"}',
    })
  })

  it("turns the API's error shape into an ApiError", async () => {
    fakeServer(() =>
      answer(403, { error: { code: 'not_invited', message: 'this app is invite-only' } }),
    )

    await expect(getMe('t')).rejects.toMatchObject({
      status: 403,
      code: 'not_invited',
      message: 'this app is invite-only',
    })
  })

  it('still gives an ApiError when the body is not JSON', async () => {
    fakeServer(() =>
      Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new Error('html')) }),
    )

    await expect(getMe('t')).rejects.toMatchObject({ status: 502, code: 'http_502' })
  })

  it('refuses an answer with the wrong shape', async () => {
    fakeServer(() => answer(200, { id: 1 }))

    await expect(getMe('t')).rejects.toMatchObject({ code: 'bad_response' })
  })

  it('marks a request that never reached the server as a network error', async () => {
    fakeServer(() => Promise.reject(new TypeError('Failed to fetch')))

    const err = await getMe('t').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 0, code: 'network' })
  })
})
