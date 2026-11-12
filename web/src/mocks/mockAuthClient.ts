import type { AuthClient, AuthUser } from '../lib/authClient'

const TESTER: AuthUser = { email: 'tester@example.com', name: 'Tess' }
const SIGNED_OUT_KEY = 'rud.mock.signedOut'

function signedOutHere(): boolean {
  try {
    return sessionStorage.getItem(SIGNED_OUT_KEY) === '1'
  } catch {
    return false
  }
}

function rememberSignedOut(signedOut: boolean) {
  try {
    if (signedOut) sessionStorage.setItem(SIGNED_OUT_KEY, '1')
    else sessionStorage.removeItem(SIGNED_OUT_KEY)
  } catch {
    // No storage (a private window): a reload signs in again, as before.
  }
}

/**
 * The sign-in for `npm run dev:mock`, instead of Firebase: you start signed in as a test user,
 * "Sign out" signs out, "Continue with Google" signs straight back in (no Google page).
 * Signed out stays signed out after a reload, in this tab, like Firebase keeps its session: so a
 * link opened while signed out goes to /login first (the e2e tests rely on it).
 */
export class MockAuthClient implements AuthClient {
  private listeners = new Set<(user: AuthUser | null) => void>()
  private user: AuthUser | null = signedOutHere() ? null : TESTER

  onUserChange(onChange: (user: AuthUser | null) => void) {
    this.listeners.add(onChange)
    onChange(this.user)
    return () => {
      this.listeners.delete(onChange)
    }
  }

  private emit(user: AuthUser | null) {
    this.user = user
    for (const listener of this.listeners) listener(user)
  }

  signIn() {
    rememberSignedOut(false)
    this.emit(TESTER)
    return Promise.resolve()
  }

  signOut() {
    rememberSignedOut(true)
    this.emit(null)
    return Promise.resolve()
  }

  getToken() {
    return Promise.resolve(this.user ? 'mock-token' : null)
  }

  redirectError() {
    return Promise.resolve(null)
  }
}
