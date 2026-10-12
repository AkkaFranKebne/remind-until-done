import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { createAppRouter } from '../app/router'
import { AuthProvider } from '../features/auth/AuthProvider'
import type { User } from '../lib/api/generated/model'
import { getGetMeMockHandler } from '../lib/api/generated/user/user.msw'
import { server } from '../mocks/server'
import type { FakeAuthClient } from './fakeAuthClient'
import { TestQueryProvider } from './TestQueryProvider'

export const testMe: User = {
  id: 'u1',
  email: 'tester@example.com',
  timezone: 'Europe/Stockholm',
  defaultTimeOfDay: '09:00',
  defaultNagIntervalMin: 60,
}

/** The fake API (MSW) answers GET /api/v1/me with `status` and `body` (default: testMe). */
export function mockMe(status = 200, body: JsonBodyType = testMe) {
  server.use(
    status === 200 && body === testMe
      ? getGetMeMockHandler(testMe)
      : http.get('*/api/v1/me', () => HttpResponse.json(body, { status })),
  )
}

/** The whole app (real routes) at `path`, signed in or out through `client`. */
export function renderApp(path: string, client: FakeAuthClient) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  render(
    <TestQueryProvider>
      <AuthProvider client={client}>
        <RouterProvider router={router} />
      </AuthProvider>
    </TestQueryProvider>,
  )
  return router
}
