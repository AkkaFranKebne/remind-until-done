import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, getMe, updateMe } from '../../lib/api/client'
import type { AuthClient, AuthUser } from '../../lib/authClient'
import { AuthContext, type AuthContextValue, type AuthState } from './useAuth'

const SIGN_IN_FAILED = 'Sign-in failed. Check your connection and try again.'

/** The phone's time zone, e.g. "Europe/Stockholm". */
function deviceTimezone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
}

export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'checking' })

  // Sync with Firebase (outside React): its "user changed" events drive the state.
  useEffect(() => {
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
      if (!user) {
        // Our own sign-out after "not invited" or a failed /me: keep that screen and its message.
        setState((prev) =>
          prev.status === 'notInvited' || prev.status === 'signedOut'
            ? prev
            : { status: 'signedOut' },
        )
        return
      }
      void loadMe(client, user).then(({ next, signOut }) => {
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
  }, [client])

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
 * After Firebase sign-in: ask the API who we are, and keep the time zone current.
 * `signOut`: the Firebase session must end (not invited, or the API refused us).
 */
async function loadMe(
  client: AuthClient,
  user: AuthUser,
): Promise<{ next: AuthState; signOut: boolean }> {
  try {
    const token = await client.getToken()
    let me = await getMe(token)

    // Design doc 5.6: the server keeps the user's time zone; the phone knows the real one.
    const tz = deviceTimezone()
    if (tz && tz !== me.timezone) {
      me = await updateMe({ timezone: tz }, token).catch(() => me)
    }
    return { next: { status: 'signedIn', me, user }, signOut: false }
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
