import type { AuthClient, AuthUser } from '../lib/authClient'

/**
 * The sign-in for `npm run dev:mock`, instead of Firebase: you start signed in as a test user,
 * "Sign out" signs out, "Continue with Google" signs straight back in (no Google page).
 */
export class MockAuthClient implements AuthClient {
  private listeners = new Set<(user: AuthUser | null) => void>()
  private user: AuthUser | null = { email: 'tester@example.com', name: 'Tess' }

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
    this.emit({ email: 'tester@example.com', name: 'Tess' })
    return Promise.resolve()
  }

  signOut() {
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
