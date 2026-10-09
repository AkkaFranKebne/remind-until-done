import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type AnyRoute,
  type RouteComponent,
  type RouterHistory,
} from '@tanstack/react-router'
import { LoginPage } from '../features/auth/LoginPage'
import { ReminderPage } from '../features/reminders/ReminderPage'
import { RemindersPage } from '../features/reminders/RemindersPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { AppLayout } from './AppLayout'
import { NotFoundPage } from './NotFoundPage'

// Routes from design doc 5.1, defined in code (no generated route files).

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFoundPage,
})

/** Signed-in pages share the header (AppLayout). RequireAuth wraps this route from M1 sign-in. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppLayout,
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
  page(rootRoute, '/login', LoginPage),
  appRoute.addChildren([
    page(appRoute, '/', RemindersPage),
    page(appRoute, '/r/$id', ReminderPage),
    page(appRoute, '/settings', SettingsPage),
  ]),
])

/** The app uses the browser's history; tests pass a memory history. */
export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history })
}

// Makes <Link to="..."> and params type-checked against the routes above.
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
