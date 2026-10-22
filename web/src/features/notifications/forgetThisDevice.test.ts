import type { PushClient } from '../../lib/pushClient'
import { forgetThisDevice } from './forgetThisDevice'

const hangingPush: PushClient = {
  isSupported: () => Promise.resolve(true),
  getToken: () => Promise.resolve('t'),
  deleteToken: () => new Promise<void>(() => {}), // never answers
}

afterEach(() => {
  jest.useRealTimers()
})

test('a cleanup that never answers stops waiting after 5 seconds, and finishes', async () => {
  jest.useFakeTimers()
  // No device id: no API call, so only the push token hangs.
  let done = false
  const cleanup = forgetThisDevice(hangingPush).then(() => {
    done = true
  })

  await jest.advanceTimersByTimeAsync(4999)
  expect(done).toBe(false)
  await jest.advanceTimersByTimeAsync(1)
  await cleanup
  expect(done).toBe(true)
})
