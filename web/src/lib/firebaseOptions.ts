import type { FirebaseOptions } from 'firebase/app'

/**
 * The Firebase settings the app uses, from Hosting's /__/firebase/init.json, each checked to be
 * text. Sign-in needs apiKey and projectId. Push also needs appId (Firebase Installations, the
 * first step of FCM's getToken) and messagingSenderId; init.json has appId only when the Hosting
 * site is linked to the Firebase Web App (infra/firebase.tf).
 */
export function toFirebaseOptions(data: unknown): FirebaseOptions {
  const text = (key: string): string | undefined => {
    const value = typeof data === 'object' && data !== null ? Reflect.get(data, key) : undefined
    return typeof value === 'string' ? value : undefined
  }
  const apiKey = text('apiKey')
  const projectId = text('projectId')
  if (!apiKey || !projectId) throw new Error('Firebase settings are incomplete')
  const appId = text('appId')
  const messagingSenderId = text('messagingSenderId')
  return {
    apiKey,
    projectId,
    ...(appId ? { appId } : {}),
    ...(messagingSenderId ? { messagingSenderId } : {}),
  }
}
