import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'
import { useAuth } from './useAuth'
import { SplashScreen } from './SplashScreen'

/**
 * The front door for signed-in pages (/, /r/:id, /settings), design doc 5.1:
 * - while Firebase restores the session: the splash screen;
 * - nobody signed in: /login?next=<this page>, so after sign-in you land here again
 *   (a tapped notification while signed out still opens the right reminder).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const { href, pathname } = useLocation()
  const navigate = useNavigate()
  // While the router moves to /login, this page is briefly still on screen but the
  // address is already /login. Don't redirect again then, or "next" nests forever.
  const mustSignIn =
    state.status !== 'checking' && state.status !== 'signedIn' && pathname !== '/login'

  // Navigation is outside React's render: do it once per change, not on every render.
  useEffect(() => {
    if (mustSignIn) void navigate({ to: '/login', search: { next: href }, replace: true })
  }, [mustSignIn, href, navigate])

  if (state.status !== 'signedIn') return <SplashScreen />
  return children
}
