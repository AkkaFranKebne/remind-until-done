import type { AuthClient, AuthUser } from '../lib/authClient'

/**
 * A sign-in client for tests and Storybook, instead of Firebase.
 * `emit(user)` plays "Firebase says the user changed"; signOut() emits null like Firebase does.
 */
export class FakeAuthClient implements AuthClient {
  private listeners = new Set<(user: AuthUser | null) => void>()
  private user: AuthUser | null
  signInCalls = 0
  signOutCalls = 0
  token: string | null = 'test-token'
  pendingRedirectError: Error | null = null
  /** Set to false to stay in "checking" (no first event), like a slow Firebase. */
  emitOnSubscribe = true

  constructor(user: AuthUser | null = null) {
    this.user = user
  }

  onUserChange(onChange: (user: AuthUser | null) => void): () => void {
    this.listeners.add(onChange)
    if (this.emitOnSubscribe) onChange(this.user)
    return () => this.listeners.delete(onChange)
  }

  emit(user: AuthUser | null) {
    this.user = user
    for (const l of this.listeners) l(user)
  }

  signIn() {
    this.signInCalls++
    return Promise.resolve()
  }

  signOut() {
    this.signOutCalls++
    this.emit(null)
    return Promise.resolve()
  }

  getToken() {
    return Promise.resolve(this.user ? this.token : null)
  }

  redirectError() {
    const err = this.pendingRedirectError
    this.pendingRedirectError = null
    return Promise.resolve(err)
  }
}

export const tester: AuthUser = { email: 'tester@example.com', name: 'Tess' }
