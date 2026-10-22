import { createMemoryHistory } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { AppRouter } from '../app/AppRouter'
import { createAppRouter } from '../app/router'
import { ToastProvider } from '../components/ui/Toast'
import { AuthProvider } from '../features/auth/AuthProvider'
import { PushClientProvider } from '../features/notifications/PushClientProvider'
import type { User } from '../lib/api/generated/model'
import { server } from '../mocks/server'
import type { FakeAuthClient } from './fakeAuthClient'
import { FakePushClient } from './fakePushClient'
import { TestQueryProvider } from './TestQueryProvider'

export const testMe: User = {
  id: 'u1',
  email: 'tester@example.com',
  timezone: 'Europe/Stockholm',
  defaultTimeOfDay: '09:00',
  defaultNagIntervalMin: 60,
}

/**
 * The fake API (MSW) answers GET /api/v1/me with `status` and `body` (default: testMe).
 * PATCH /api/v1/me (the time zone update) answers with that user plus the changes.
 */
export function mockMe(status = 200, body: JsonBodyType = testMe) {
  server.use(
    http.get('*/api/v1/me', () => HttpResponse.json(body, { status })),
    http.patch('*/api/v1/me', async ({ request }) => {
      const changes: unknown = await request.json()
      const base = typeof body === 'object' && body !== null ? body : {}
      const merged =
        typeof changes === 'object' && changes !== null ? { ...base, ...changes } : base
      return HttpResponse.json(merged)
    }),
  )
}

/** The whole app (real routes) at `path`, signed in or out through `client`; pushes through `push`. */
export function renderApp(path: string, client: FakeAuthClient, push = new FakePushClient()) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  render(
    <TestQueryProvider>
      <AuthProvider client={client}>
        <PushClientProvider client={push}>
          <ToastProvider>
            <AppRouter router={router} />
          </ToastProvider>
        </PushClientProvider>
      </AuthProvider>
    </TestQueryProvider>,
  )
  return router
}
