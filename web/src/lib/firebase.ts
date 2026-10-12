import { initializeApp, type FirebaseOptions } from 'firebase/app'
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
  type Auth,
} from 'firebase/auth'
import type { AuthClient } from './authClient'

/**
 * The real sign-in client (Firebase Auth, Google only).
 *
 * - The Firebase web settings come from Firebase Hosting itself: every Hosting site
 *   serves them at /__/firebase/init.json (public by design). So one build works for
 *   dev and prod. Locally, Vite forwards /__/ to the dev site (vite.config.ts).
 * - authDomain is the address the app runs on, so Google's sign-in page comes back
 *   to the same site. Browsers that block third-party storage (Safari, the installed
 *   iPhone app) break the redirect otherwise (design doc 5.5).
 */
async function loadAuth(): Promise<Auth> {
  const res = await fetch('/__/firebase/init.json')
  if (!res.ok) throw new Error(`Firebase settings not found (${res.status})`)
  const app = initializeApp({ ...toOptions(await res.json()), authDomain: window.location.host })
  return getAuth(app)
}

/** Only the settings sign-in needs, each checked to be text. */
function toOptions(data: unknown): FirebaseOptions {
  const get = (key: string): unknown =>
    typeof data === 'object' && data !== null ? Reflect.get(data, key) : undefined
  const apiKey = get('apiKey')
  const projectId = get('projectId')
  const messagingSenderId = get('messagingSenderId')
  if (typeof apiKey !== 'string' || typeof projectId !== 'string') {
    throw new Error('Firebase settings are incomplete')
  }
  return {
    apiKey,
    projectId,
    ...(typeof messagingSenderId === 'string' ? { messagingSenderId } : {}),
  }
}

export function createFirebaseAuthClient(): AuthClient {
  const ready = loadAuth()

  return {
    onUserChange(onChange) {
      let stop: (() => void) | undefined
      let stopped = false
      ready.then(
        (auth) => {
          if (stopped) return
          stop = onAuthStateChanged(auth, (u) =>
            onChange(u ? { email: u.email, name: u.displayName } : null),
          )
        },
        // Settings couldn't load: behave as signed out; sign-in will show the error.
        () => onChange(null),
      )
      return () => {
        stopped = true
        stop?.()
      }
    },
    async signIn() {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' }) // let people pick the right Google account
      await signInWithRedirect(await ready, provider)
    },
    async signOut() {
      await signOut(await ready)
    },
    async getToken() {
      return (await ready).currentUser?.getIdToken() ?? null
    },
    async redirectError() {
      try {
        await getRedirectResult(await ready)
        return null
      } catch (e) {
        return e instanceof Error ? e : new Error(String(e))
      }
    },
  }
}
