import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { createAppRouter } from '../app/router'
import { AuthProvider } from '../features/auth/AuthProvider'
import { setHttp, type Me } from '../lib/api/client'
import type { FakeAuthClient } from './fakeAuthClient'

export const testMe: Me = {
  id: 'u1',
  email: 'ewa.wrobel@gmail.com',
  timezone: 'Europe/Stockholm',
  defaultTimeOfDay: '09:00',
  defaultNagIntervalMin: 60,
}

/** Fake API: GET /api/v1/me answers with `status` and `body` (default: testMe). */
export function mockMe(status = 200, body: unknown = testMe) {
  setHttp(() => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) }))
}

/** The whole app (real routes) at `path`, signed in or out through `client`. */
export function renderApp(path: string, client: FakeAuthClient) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  render(
    <AuthProvider client={client}>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
  return router
}
