import { safeNext } from './safeNext'

describe('safeNext', () => {
  it.each(['/', '/r/123', '/settings', '/r/abc?tab=done', '/r/abc#notes'])(
    'keeps the app path %s',
    (path) => {
      expect(safeNext(path)).toBe(path)
    },
  )

  it.each([
    ['another site', 'https://evil.example'],
    ['protocol-relative', '//evil.example'],
    ['backslash trick', '/\\evil.example'],
    ['tab trick', '/\t/evil.example'],
    ['line break trick', '/\n/evil.example'],
    ['javascript URL', 'javascript:alert(1)'],
    ['relative path', 'settings'],
    ['empty', ''],
    ['the login page', '/login'],
    ['the login page with its own next', '/login?next=%2Fsettings'],
    ['the login page in capitals', '/LOGIN'],
  ])('refuses %s', (_name, value) => {
    expect(safeNext(value)).toBeUndefined()
  })

  it('drops hidden characters the way the browser does, and stays on our site', () => {
    expect(safeNext('/r/1\nx')).toBe('/r/1x')
  })

  it('refuses anything that is not a string', () => {
    expect(safeNext(undefined)).toBeUndefined()
    expect(safeNext(['/'])).toBeUndefined()
  })
})
