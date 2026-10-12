/**
 * What the app needs from a sign-in service. The real one is Firebase
 * (src/lib/firebase.ts); tests and Storybook pass a fake. Same idea as the API's
 * TokenVerifier interface: the app never imports Firebase directly.
 */
export type AuthUser = {
  email: string | null
  /** Google display name, e.g. "Ewa". Only for showing; not stored by the API. */
  name: string | null
}

export type AuthClient = {
  /** Calls `onChange` now and whenever the signed-in user changes. Returns "stop listening". */
  onUserChange(onChange: (user: AuthUser | null) => void): () => void
  /** Leaves the page for Google's sign-in and comes back (redirect, not popup: design doc 5.5). */
  signIn(): Promise<void>
  signOut(): Promise<void>
  /** A fresh ID token for the API, or null when nobody is signed in. Firebase refreshes it. */
  getToken(): Promise<string | null>
  /** After coming back from Google: the error, if that sign-in failed. */
  redirectError(): Promise<Error | null>
}
