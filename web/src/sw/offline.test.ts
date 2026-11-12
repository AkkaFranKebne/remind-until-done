import { offlinePage } from './offline'

test('the privacy notice offline is its own cached page', () => {
  expect(offlinePage('/privacy.html')).toBe('privacy.html')
})

test('every other page offline is the cached app', () => {
  for (const path of ['/', '/login', '/settings', '/r/abc', '/privacy']) {
    expect(offlinePage(path)).toBe('index.html')
  }
})
