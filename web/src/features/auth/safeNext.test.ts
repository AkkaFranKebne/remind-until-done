import { safeNext } from './safeNext'

describe('safeNext', () => {
  it.each(['/', '/r/123', '/settings', '/r/abc?tab=done'])('keeps the app path %s', (path) => {
    expect(safeNext(path)).toBe(path)
  })

  it.each([
    ['another site', 'https://evil.example'],
    ['protocol-relative', '//evil.example'],
    ['backslash trick', '/\\evil.example'],
    ['tab trick', '/\t/evil.example'],
    ['line break', '/r/1\nx'],
    ['javascript URL', 'javascript:alert(1)'],
    ['relative path', 'settings'],
    ['empty', ''],
    ['the login page', '/login'],
    ['the login page with its own next', '/login?next=%2Fsettings'],
    ['the login page in capitals', '/LOGIN'],
  ])('refuses %s', (_name, value) => {
    expect(safeNext(value)).toBeUndefined()
  })

  it('refuses anything that is not a string', () => {
    expect(safeNext(undefined)).toBeUndefined()
    expect(safeNext(['/'])).toBeUndefined()
  })
})
