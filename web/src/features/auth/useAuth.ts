import { createContext, useContext } from 'react'
import type { AuthUser } from '../../lib/authClient'

/**
 * Who is signed in, for the whole app (design doc 5.1, 5.6).
 *
 *   checking   Firebase is still restoring the session (show the splash screen)
 *   signedOut  nobody, or sign-in failed (`error` says why); `byUser`: they tapped Sign out
 *   notInvited signed in with Google, but not on the invite list. They stay signed in, so they
 *              can delete their account or sign out (decision 79)
 *   offline    Firebase has a session, but no connection to ask the API: show the offline screen
 *   signedIn   the API knows them; their settings (GET /me) come from useMe()
 */
export type AuthState =
  | { status: 'checking' }
  | { status: 'signedOut'; error?: string; byUser?: boolean; accountDeleted?: boolean }
  | { status: 'notInvited'; email: string | null }
  | { status: 'offline' }
  | { status: 'signedIn'; user: AuthUser }

export type AuthContextValue = {
  state: AuthState
  /** Who is signed in (Google name and email), or null. Same as `state.user` when signedIn. */
  user: AuthUser | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  /** The connection is back: ask the API again who this is. */
  retrySignIn: () => void
  /** The API has deleted the account: end the session, and the login page says so once. */
  accountDeleted: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
