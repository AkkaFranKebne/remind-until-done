import { safeAppPath, toNotification, urlOf } from './notification'

test('our data-only push: title, body, one notification per reminder, a tap opens it', () => {
  const shown = toNotification({
    data: {
      title: 'Call dentist',
      body: 'Plot twist: it still has not done itself.',
      reminderId: 'abc',
    },
    fcmMessageId: 'x',
  })

  expect(shown.title).toBe('Call dentist')
  expect(shown.options).toMatchObject({
    body: 'Plot twist: it still has not done itself.',
    tag: 'abc',
    renotify: true,
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    requireInteraction: true, // desktop: stays on screen until clicked or closed
    data: { url: '/r/abc' },
  })
  expect(shown.reminderId).toBe('abc') // so open pages refresh it
  expect(shown.options.timestamp).toBeUndefined() // no sentAt: the browser uses "now"
})

test('the time it was sent, not the time it arrived (a phone that was off)', () => {
  const sentAt = '2026-10-24T07:40:00Z'
  expect(toNotification({ data: { reminderId: 'abc', sentAt } }).options.timestamp).toBe(
    Date.parse(sentAt),
  )
  for (const bad of ['', 'yesterday', 42, null]) {
    expect(toNotification({ data: { reminderId: 'abc', sentAt: bad } }).options).not.toHaveProperty(
      'timestamp',
    )
  }
})

test('a test message from the Firebase console (a notification, no data) is shown too', () => {
  const shown = toNotification({ notification: { title: 'Test', body: 'Hello from the console' } })

  expect(shown.title).toBe('Test')
  expect(shown.options.body).toBe('Hello from the console')
  expect(shown.options.tag).toBeUndefined() // no reminder: it doesn't replace anything
  expect(shown.options.requireInteraction).toBeUndefined() // and slides away as usual
  expect(shown.reminderId).toBeUndefined()
  expect(shown.options.data).toEqual({ url: '/' })
})

test('anything else still shows a notification (iOS requires one for every push)', () => {
  for (const payload of [undefined, null, 'text', 42, { data: 'nope' }, { data: { title: '' } }]) {
    const shown = toNotification(payload)
    expect(shown.title).toBe('rud.')
    expect(shown.options.data).toEqual({ url: '/' })
  }
})

test('a tap only ever opens a page of this app', () => {
  expect(safeAppPath('/r/abc?x=1')).toBe('/r/abc?x=1')
  for (const bad of [
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example', // the URL parser drops tabs and newlines
    '/\n/evil.example',
    'javascript:alert(1)',
    'r/abc',
    '',
    7,
  ]) {
    expect(safeAppPath(bad)).toBe('/')
  }
  expect(
    toNotification({ data: { url: 'https://evil.example', reminderId: 'abc' } }).options.data,
  ).toEqual({
    url: '/',
  })
  expect(urlOf({ url: '/r/abc' })).toBe('/r/abc')
  expect(urlOf(undefined)).toBe('/')
})
