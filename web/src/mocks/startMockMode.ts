import { setupWorker } from 'msw/browser'
import type { AuthClient } from '../lib/authClient'
import type { PushClient } from '../lib/pushClient'
import { devHandlers } from './devApi'
import { MockAuthClient } from './mockAuthClient'
import { MockPushClient } from './mockPushClient'

/**
 * `npm run dev:mock`: the app without the Go API, the database or Firebase. MSW's service
 * worker answers /api calls in the browser from devApi.ts, MockAuthClient signs you in and
 * MockPushClient hands out a fixed push token.
 * main.tsx loads this file only in mock mode, so the production build never contains it.
 */
export async function startMockMode(): Promise<{ authClient: AuthClient; pushClient: PushClient }> {
  await setupWorker(...devHandlers).start({
    // Everything that isn't the API (Vite's own files, fonts) goes to the network as usual.
    onUnhandledRequest: 'bypass',
  })
  return { authClient: new MockAuthClient(), pushClient: new MockPushClient() }
}
