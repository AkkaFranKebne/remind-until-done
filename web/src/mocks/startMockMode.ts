import { setupWorker } from 'msw/browser'
import type { AuthClient } from '../lib/authClient'
import { devHandlers } from './devApi'
import { MockAuthClient } from './mockAuthClient'

/**
 * `npm run dev:mock`: the app without the Go API, the database or Firebase. MSW's service
 * worker answers /api calls in the browser from devApi.ts, and MockAuthClient signs you in.
 * main.tsx loads this file only in mock mode, so the production build never contains it.
 */
export async function startMockMode(): Promise<AuthClient> {
  await setupWorker(...devHandlers).start({
    // Everything that isn't the API (Vite's own files, fonts) goes to the network as usual.
    onUnhandledRequest: 'bypass',
  })
  return new MockAuthClient()
}
