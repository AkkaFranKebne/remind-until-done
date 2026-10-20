import { RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '../features/auth/useAuth'
import type { createAppRouter } from './router'

/**
 * The router, with who is signed in as its context (the route guards read it in beforeLoad).
 * Sign-in changes happen outside the router (Firebase), so on each change this hands the router
 * the new state and runs the guards again: signed out on a signed-in page → /login; signed in
 * on /login → `next`.
 */
export function AppRouter({ router }: { router: ReturnType<typeof createAppRouter> }) {
  const { state } = useAuth()
  useEffect(() => {
    router.update({ ...router.options, context: { auth: state } })
    void router.invalidate()
  }, [router, state])
  return <RouterProvider router={router} />
}
