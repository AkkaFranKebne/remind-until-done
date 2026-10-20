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
  expect(done).toMatchObject({ status: 'done', nagsExhausted: false })
})
