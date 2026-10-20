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
    data: { url: '/r/abc' },
  })
})

test('a test message from the Firebase console (a notification, no data) is shown too', () => {
  const shown = toNotification({ notification: { title: 'Test', body: 'Hello from the console' } })

  expect(shown.title).toBe('Test')
  expect(shown.options.body).toBe('Hello from the console')
  expect(shown.options.tag).toBeUndefined() // no reminder: it doesn't replace anything
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
