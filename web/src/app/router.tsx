import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
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

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

/** Signed-in pages share the header. RequireAuth wraps this route from M1 sign-in. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppLayout,
})

const remindersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: RemindersPage,
})

const reminderRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/r/$id',
  component: ReminderPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: SettingsPage,
})

export const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([remindersRoute, reminderRoute, settingsRoute]),
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
