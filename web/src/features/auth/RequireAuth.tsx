import type { ReactNode } from 'react'
import { useRegisterOnStart } from '../notifications/useNotifications'
import { useAuth } from './useAuth'
import { SplashScreen } from './SplashScreen'

/**
 * The frame of signed-in pages: the splash screen until someone is signed in. Sending signed-out
 * visitors to /login is the route's job (its beforeLoad, app/router.tsx), before this renders.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  if (state.status !== 'signedIn') return <SplashScreen />
  return (
    <>
      <RegisterOnStart />
      {children}
    </>
  )
}

/** Signed in: register this device for pushes again, if allowed (design doc 5.7). */
function RegisterOnStart() {
  useRegisterOnStart()
  return null
}
