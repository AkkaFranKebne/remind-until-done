import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type AnyRoute,
  type RouteComponent,
  type RouterHistory,
} from '@tanstack/react-router'
import { isStatusKind, type ReminderStatusKind } from '../components/ui/status'
import { LoginPage } from '../features/auth/LoginPage'
import { RequireAuth } from '../features/auth/RequireAuth'
import { safeNext } from '../features/auth/safeNext'
import type { AuthState } from '../features/auth/useAuth'
import { ReminderPage } from '../features/reminders/ReminderPage'
import { RemindersPage } from '../features/reminders/RemindersPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { NotFoundPage } from './NotFoundPage'

// Routes from design doc 5.1, defined in code (no generated route files).

/** What every route can read: who is signed in (AppRouter passes it in, from AuthProvider). */
export type RouterContext = { auth: AuthState }

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFoundPage,
})

/**
 * Signed-in pages (design doc 5.1). The guard runs before the page: nobody signed in →
 * /login?next=<this page>, so after sign-in you land here again (a tapped notification while
 * signed out still opens the right reminder). While Firebase is still checking there's no
 * decision yet: RequireAuth shows the splash, and AppRouter re-runs this when it settles.
 * TanStack Router docs → "Authenticated Routes".
 */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: ({ context, location }) => {
    const { status } = context.auth
    if (status === 'checking' || status === 'signedIn') return
    // Tapped Sign out: a fresh start on the plain login page (then the list), not back to this
    // page. Signed out any other way (session ended): remember the page in `next`.
    const byUser = context.auth.status === 'signedOut' && context.auth.byUser === true
    throw redirect({ to: '/login', search: byUser ? {} : { next: location.href }, replace: true })
  },
  component: () => (
    <RequireAuth>
      <Outlet />
    </RequireAuth>
  ),
})

/** /login?next=/r/123: where to go after sign-in, only if it's a path in this app. */
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: safeNext(search.next),
  }),
  // Signed in (now, or as soon as the sign-in finishes): on to `next`, or home.
  beforeLoad: ({ context, search }) => {
    if (context.auth.status === 'signedIn')
      throw redirect({ href: search.next ?? '/', replace: true })
  },
})

/** / and /?show=done: the picked tile lives in the address, so Back and reload keep it. */
const remindersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: RemindersPage,
  validateSearch: (search: Record<string, unknown>): { show?: ReminderStatusKind } => ({
    show: isStatusKind(search.show) ? search.show : undefined,
  }),
})

/**
 * A page route: `path` under `parent`, showing `component`.
 * `const TPath` keeps the exact path text (e.g. '/r/$id'), so links and params stay type-checked.
 */
function page<TParent extends AnyRoute, const TPath extends string>(
  parent: TParent,
  path: TPath,
  component: RouteComponent,
) {
  return createRoute({ getParentRoute: () => parent, path, component })
}

export const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    remindersRoute,
    page(appRoute, '/r/$id', ReminderPage),
    page(appRoute, '/settings', SettingsPage),
  ]),
])

/** The app uses the browser's history; tests pass a memory history. */
export function createAppRouter(history?: RouterHistory) {
  // `auth` starts as "checking"; AppRouter passes the real state on every render.
  return createRouter({ routeTree, history, context: { auth: { status: 'checking' } } })
}

// Makes <Link to="..."> and params type-checked against the routes above.
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
