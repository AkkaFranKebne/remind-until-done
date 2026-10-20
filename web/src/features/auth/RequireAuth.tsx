import type { ReactNode } from 'react'
import { useAuth } from './useAuth'
import { SplashScreen } from './SplashScreen'

/**
 * The frame of signed-in pages: the splash screen until someone is signed in. Sending signed-out
 * visitors to /login is the route's job (its beforeLoad, app/router.tsx), before this renders.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  if (state.status !== 'signedIn') return <SplashScreen />
  return children
}
