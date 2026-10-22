import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
  type Auth,
} from 'firebase/auth'
import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import type { AuthClient } from './authClient'
import type { PushClient } from './pushClient'

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
async function loadApp(): Promise<FirebaseApp> {
  const res = await fetch('/__/firebase/init.json')
  if (!res.ok) throw new Error(`Firebase settings not found (${res.status})`)
  return initializeApp({ ...toOptions(await res.json()), authDomain: window.location.host })
}

/**
 * The public Web Push (VAPID) key of each Firebase project (console → Project settings → Cloud
 * Messaging → Web Push certificates). Public by design, like the rest of init.json; it isn't in
 * init.json, so it's picked by project here. Never generate a new one: every phone would have to
 * register again.
 */
const VAPID_KEYS: Record<string, string> = {
  'rud-dev-4f7k2':
    'BGJF2q7eDCT2B04tLIOrJhbWPqoSh_CcPKHDCY9Sla_qXpu7O4bSvo_1quGi4SF_tL4UhkZlTYIm-pVimSrNK6Y',
  'rud-prod-4f7k2':
    'BPz1SY-blUEvPYg_nq9g-sUOnV6p6hc1HDJTMD-mH4Pu_ScjIovl3_zGLcHBEaTHMSM674oky_d5fF8e9NLVaLY',
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

/** The real sign-in and push clients, sharing one Firebase app. */
export function createFirebaseClients(): { authClient: AuthClient; pushClient: PushClient } {
  const app = loadApp()
  return {
    authClient: createAuthClient(app.then((a) => getAuth(a))),
    pushClient: createPushClient(app),
  }
}

function createAuthClient(ready: Promise<Auth>): AuthClient {
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

/**
 * Push through Firebase Cloud Messaging (design doc 5.7, 5.8). getToken gets our one service
 * worker's registration: FCM's own worker file isn't used (decision 41).
 */
function createPushClient(ready: Promise<FirebaseApp>): PushClient {
  return {
    async isSupported() {
      return (await isSupported()) && 'Notification' in window
    },
    async getToken() {
      const app = await ready
      const vapidKey = VAPID_KEYS[app.options.projectId ?? '']
      if (!vapidKey) throw new Error(`No Web Push key for project ${app.options.projectId}`)
      // The worker is registered in builds only (main.tsx): `npm run dev` has none.
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) throw new Error('No service worker: pushes need a build')
      return getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration })
    },
  }
}
