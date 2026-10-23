import { act, renderHook } from '@testing-library/react'
import { useNow } from './useNow'

afterEach(() => jest.useRealTimers())

test('ticks on the whole minute, not a minute after the page opened', () => {
  jest.useFakeTimers({ now: new Date('2026-10-23T14:59:20Z') })
  const { result } = renderHook(() => useNow())
  expect(result.current).toEqual(new Date('2026-10-23T14:59:20Z'))

  act(() => {
    jest.advanceTimersByTime(39_999)
  }) // 14:59:59.999
  expect(result.current).toEqual(new Date('2026-10-23T14:59:20Z'))

  act(() => {
    jest.advanceTimersByTime(1)
  }) // 15:00:00
  expect(result.current).toEqual(new Date('2026-10-23T15:00:00Z'))

  act(() => {
    jest.advanceTimersByTime(60_000)
  }) // and every minute after that
  expect(result.current).toEqual(new Date('2026-10-23T15:01:00Z'))
})

test('every second, on the second', () => {
  jest.useFakeTimers({ now: new Date('2026-10-23T15:00:00.400Z') })
  const { result } = renderHook(() => useNow(1000))

  act(() => {
    jest.advanceTimersByTime(600)
  })
  expect(result.current).toEqual(new Date('2026-10-23T15:00:01Z'))
})

test('back from the background: catches up at once', () => {
  jest.useFakeTimers({ now: new Date('2026-10-23T14:58:00Z') })
  const { result } = renderHook(() => useNow())
  jest.setSystemTime(new Date('2026-10-23T15:05:00Z')) // the timers were paused meanwhile

  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })

  expect(result.current).toEqual(new Date('2026-10-23T15:05:00Z'))
})
