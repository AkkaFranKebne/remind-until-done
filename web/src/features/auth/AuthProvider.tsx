import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, setTokenSource } from '../../lib/api/mutator'
import type { AuthClient, AuthUser } from '../../lib/authClient'
import { AuthContext, type AuthContextValue, type AuthState } from './useAuth'
import { meQueryOptions } from './useMe'

const SIGN_IN_FAILED = 'Sign-in failed. Check your connection and try again.'

export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'checking' })
  const queryClient = useQueryClient()

  // Sync with Firebase (outside React): its "user changed" events drive the state.
  useEffect(() => {
    // Every API call (lib/api/mutator.ts) asks the sign-in client for a fresh token.
    setTokenSource(() => client.getToken())
    let current = 0 // ignore answers to older events (fast sign-in, sign-out, sign-in)

    // Coming back from Google with a failed sign-in: show why on the login page.
    void client.redirectError().then((err) => {
      if (err)
        setState((prev) =>
          prev.status === 'signedOut' ? { ...prev, error: SIGN_IN_FAILED } : prev,
        )
    })

    const stop = client.onUserChange((user) => {
      const run = ++current
      // A different person (or nobody): drop all cached server data, so one user never
      // sees another's (design doc 5.7). Firebase only reports sign-in and sign-out here.
      queryClient.clear()
      if (!user) {
        // Our own sign-out after "not invited" or a failed /me: keep that screen and its message.
        setState((prev) =>
          prev.status === 'notInvited' || prev.status === 'signedOut'
            ? prev
            : { status: 'signedOut' },
        )
        return
      }
      void loadMe(queryClient, user).then(({ next, signOut }) => {
        if (run !== current) return
        setState(next) // first show the result ...
        // ... then sign out (that event keeps this state). A failed sign-out changes nothing.
        if (signOut) client.signOut().catch(() => {})
      })
    })
    return () => {
      current = -1
      stop()
    }
  }, [client, queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signIn: async () => {
        try {
          await client.signIn() // leaves the page for Google
        } catch {
          setState({ status: 'signedOut', error: SIGN_IN_FAILED })
        }
      },
      signOut: () => client.signOut(),
    }),
    [client, state],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

/**
 * After Firebase sign-in: ask the API who we are (GET /me, kept in the query cache).
 * `signOut`: the Firebase session must end (not invited, or the API refused us).
 */
async function loadMe(
  queryClient: QueryClient,
  user: AuthUser,
): Promise<{ next: AuthState; signOut: boolean }> {
  try {
    await queryClient.fetchQuery(meQueryOptions())
    return { next: { status: 'signedIn', user }, signOut: false }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'not_invited') {
      return { next: { status: 'notInvited', email: user.email }, signOut: true }
    }
    // Offline (status 0): keep the Firebase session, so the app works again once the
    // connection is back. Any other failure ends it.
    const offline = e instanceof ApiError && e.status === 0
    return {
      next: { status: 'signedOut', error: offline ? e.message : SIGN_IN_FAILED },
      signOut: !offline,
    }
  }
}
