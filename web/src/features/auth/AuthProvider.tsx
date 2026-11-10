import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, setTokenSource } from '../../lib/api/mutator'
import type { AuthClient, AuthUser } from '../../lib/authClient'
import { AuthContext, type AuthContextValue, type AuthState } from './useAuth'
import { meQueryOptions } from './useMe'

const noRetry = () => {}

const SIGN_IN_FAILED = 'Sign-in failed. Check your connection and try again.'

/**
 * Over the API's rate limit at sign-in (429, decision 86): ask again after this long. The limit
 * refills a request a second, so the next try passes; the splash just stays a moment longer.
 */
export const RATE_LIMITED_RETRY_MS = 5000

export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'checking' })
  // Set when the person taps Sign out, so the next "nobody" event is marked byUser.
  const signingOut = useRef(false)
  // Runs the /me request for the current session again. Stable, so effects can depend on it.
  const retry = useRef(noRetry)
  const retrySignIn = useCallback(() => retry.current(), [])
  const queryClient = useQueryClient()

  // Sync with Firebase (outside React): its "user changed" events drive the state.
  useEffect(() => {
    // Every API call (lib/api/mutator.ts) asks the sign-in client for a fresh token.
    setTokenSource(() => client.getToken())
    let current = 0 // ignore answers to older events (fast sign-in, sign-out, sign-in)
    let later: number | undefined // a /me asked again after a 429

    // Coming back from Google with a failed sign-in: show why on the login page.
    void client.redirectError().then((err) => {
      if (err)
        setState((prev) =>
          prev.status === 'signedOut' ? { ...prev, error: SIGN_IN_FAILED } : prev,
        )
    })

    const stop = client.onUserChange((user) => {
      const run = ++current
      window.clearTimeout(later)
      // A different person (or nobody): drop all cached server data, so one user never
      // sees another's (design doc 5.7). Firebase only reports sign-in and sign-out here.
      queryClient.clear()
      if (!user) {
        retry.current = noRetry
        // Our own sign-out after a failed /me: keep that message.
        setState((prev) =>
          prev.status === 'signedOut' ? prev : { status: 'signedOut', byUser: signingOut.current },
        )
        return
      }
      const load = () => {
        void loadMe(queryClient, user).then(({ next, signOut, again }) => {
          if (run !== current) return
          if (again) {
            later = window.setTimeout(load, RATE_LIMITED_RETRY_MS)
            return // still "checking": the splash stays
          }
          setState(next) // first show the result ...
          // ... then sign out (that event keeps this state). A failed sign-out changes nothing.
          if (signOut) client.signOut().catch(() => {})
        })
      }
      retry.current = load
      load()
    })
    return () => {
      current = -1
      window.clearTimeout(later)
      stop()
    }
  }, [client, queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      user: state.status === 'signedIn' ? state.user : null,
      retrySignIn,
      signIn: async () => {
        try {
          await client.signIn() // leaves the page for Google
        } catch {
          setState({ status: 'signedOut', error: SIGN_IN_FAILED })
        }
      },
      signOut: () => {
        signingOut.current = true
        return client.signOut().finally(() => {
          signingOut.current = false
        })
      },
      accountDeleted: async () => {
        // Set directly, not through the "nobody" event: Firebase may have signed out by itself
        // already (the user is gone), and then no event comes. A failed sign-out changes nothing:
        // the account is gone either way.
        signingOut.current = true
        await client.signOut().catch(() => {})
        signingOut.current = false
        queryClient.clear()
        setState({ status: 'signedOut', byUser: true, accountDeleted: true })
      },
    }),
    [client, queryClient, retrySignIn, state],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

/**
 * After Firebase sign-in: ask the API who we are (GET /me, kept in the query cache).
 * `signOut`: the Firebase session must end (the API refused us). Not invited keeps it, for the
 * buttons on the invite-only screen (decision 79).
 */
async function loadMe(
  queryClient: QueryClient,
  user: AuthUser,
): Promise<{ next: AuthState; signOut: boolean; again?: boolean }> {
  try {
    await queryClient.fetchQuery(meQueryOptions())
    return { next: { status: 'signedIn', user }, signOut: false }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'not_invited') {
      return { next: { status: 'notInvited', email: user.email }, signOut: false }
    }
    // Offline (status 0): keep the Firebase session, so the app works again once the
    // connection is back. Any other failure ends it.
    if (e instanceof ApiError && e.status === 0)
      return { next: { status: 'offline' }, signOut: false }
    // Over the rate limit: nothing is wrong with the session, so keep it and ask again soon.
    if (e instanceof ApiError && e.status === 429)
      return { next: { status: 'checking' }, signOut: false, again: true }
    return { next: { status: 'signedOut', error: SIGN_IN_FAILED }, signOut: true }
  }
}
