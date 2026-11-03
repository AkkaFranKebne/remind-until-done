import * as z from 'zod/mini'
import { server } from './server'
import { devHandlers, resetDevData } from './devApi'

// The dev:mock fake keeps the real API's rules (design doc decision 35), so screens built
// against it behave the same with the real API.
beforeEach(() => {
  resetDevData()
  server.use(...devHandlers)
})

const api = (path: string, init?: RequestInit) =>
  fetch(`http://localhost/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  })
const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString()

test('starts with one reminder in each state and creates up to 5 active', async () => {
  const list: unknown = await (await api('/reminders?status=upcoming')).json()
  expect(list).toHaveProperty('items.length', 4)

  const create = () =>
    api('/reminders', { method: 'POST', body: JSON.stringify({ title: 'X', dueAt: inAnHour() }) })
  expect((await create()).status).toBe(201)
  const sixth = await create()
  expect(sixth.status).toBe(409)
  expect(await sixth.json()).toEqual({ error: expect.objectContaining({ code: 'limit_reached' }) })
})

test('refuses what the real API refuses: a past time, a too-long title, an unknown id', async () => {
  const past = await api('/reminders', {
    method: 'POST',
    body: JSON.stringify({ title: 'X', dueAt: new Date(Date.now() - 3_600_000).toISOString() }),
  })
  expect(past.status).toBe(400)
  const long = await api('/reminders', {
    method: 'POST',
    body: JSON.stringify({ title: 'x'.repeat(201), dueAt: inAnHour() }),
  })
  expect(long.status).toBe(400)
  expect((await api('/reminders/nope')).status).toBe(404)
})

test('counts characters like the form: 200 emoji fit; a reminder done after 12 pushes is not exhausted', async () => {
  const emoji = await api('/reminders', {
    method: 'POST',
    body: JSON.stringify({ title: '🐈'.repeat(200), dueAt: inAnHour() }),
  })
  expect(emoji.status).toBe(201)

  const list: unknown = await (await api('/reminders?status=upcoming')).json()
  expect(list).toHaveProperty('items.0.nagsExhausted', true) // Renew passport: 12 pushes
  const renewPassport = '00000000-0000-4000-8000-000000000004'
  expect(list).toHaveProperty('items.0.id', renewPassport)
  const done: unknown = await (
    await api(`/reminders/${renewPassport}/done`, { method: 'POST' })
  ).json()
  expect(done).toMatchObject({ status: 'done', nagsExhausted: false, line: expect.any(String) })
})

test("a new interval moves a nagging reminder's next nag: last push + interval, or the interval from now (decision 62)", async () => {
  // Reply to landlord: 5 pushes every 60 min, the last one 20 min ago.
  const landlord = '00000000-0000-4000-8000-000000000002'
  const patch = (nagIntervalMin: number) =>
    api(`/reminders/${landlord}`, { method: 'PATCH', body: JSON.stringify({ nagIntervalMin }) })
  const Answer = z.object({ sentAt: z.string(), nextNagAt: z.string(), nagCount: z.number() })

  const later = Answer.parse(await (await patch(30)).json())
  expect(Date.parse(later.nextNagAt)).toBe(Date.parse(later.sentAt) + 30 * 60_000)
  expect(later.nagCount).toBe(5)

  // 15 min after the last push has passed: 15 min from now, never right away.
  const before = Date.now()
  const fromNow = Answer.parse(await (await patch(15)).json())
  expect(Date.parse(fromNow.nextNagAt)).toBeGreaterThanOrEqual(before + 15 * 60_000)
  expect(Date.parse(fromNow.nextNagAt)).toBeLessThanOrEqual(Date.now() + 15 * 60_000)
})

test('a new interval leaves the next nag alone when nothing is nagging or the time moved', async () => {
  const patch = (id: string, body: object) =>
    api(`/reminders/00000000-0000-4000-8000-00000000000${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  const nextNag = async (res: Response) =>
    z.object({ nextNagAt: z.nullable(z.string()) }).parse(await res.json()).nextNagAt

  const landlord = await nextNag(await api('/reminders/00000000-0000-4000-8000-000000000002'))
  expect(await nextNag(await patch('2', { nagIntervalMin: 60 }))).toBe(landlord) // the same interval
  expect(await nextNag(await patch('1', { nagIntervalMin: 15 }))).toBeNull() // waiting
  expect(await nextNag(await patch('4', { nagIntervalMin: 15 }))).toBeNull() // all 12 pushes sent
  expect(await nextNag(await patch('2', { nagIntervalMin: 15, dueAt: inAnHour() }))).toBeNull() // a new time restarts
})

test('devices: one per user, the same token keeps its id, a new one replaces it (decision 40)', async () => {
  expect(await (await api('/devices')).json()).toEqual({ items: [] })
  // The answer is a Device: an id, and never the push token.
  const Device = z.object({ id: z.string() })
  const register = async (fcmToken: string) => {
    const res = await api('/devices', {
      method: 'POST',
      body: JSON.stringify({ fcmToken, platform: 'ios' }),
    })
    expect(res.status).toBe(200)
    const device: unknown = await res.json()
    expect(device).not.toHaveProperty('fcmToken')
    return Device.parse(device).id
  }

  const first = await register('phone-a')
  expect(await register('phone-a')).toBe(first)
  const second = await register('phone-b')
  expect(second).not.toBe(first)
  expect(await (await api('/devices')).json()).toHaveProperty('items.length', 1)

  const bad = await api('/devices', {
    method: 'POST',
    body: JSON.stringify({ fcmToken: '', platform: 'ios' }),
  })
  expect(bad.status).toBe(400)
  expect((await api(`/devices/${first}`, { method: 'DELETE' })).status).toBe(404)
  expect((await api(`/devices/${second}`, { method: 'DELETE' })).status).toBe(204)
})
