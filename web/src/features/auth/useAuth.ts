import { createContext, useContext } from 'react'
import type { Me } from '../../lib/api/client'
import type { AuthUser } from '../../lib/authClient'

/**
 * Who is signed in, for the whole app (design doc 5.1, 5.6).
 *
 *   checking   Firebase is still restoring the session (show the splash screen)
 *   signedOut  nobody, or sign-in failed (`error` says why)
 *   notInvited signed in with Google, but not on the invite list: we signed them out
 *   signedIn   `me` is the API's user (GET /api/v1/me)
 */
export type AuthState =
  | { status: 'checking' }
  | { status: 'signedOut'; error?: string }
  | { status: 'notInvited'; email: string | null }
  | { status: 'signedIn'; me: Me; user: AuthUser }

export type AuthContextValue = {
  state: AuthState
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
