/**
 * What the app needs from a push service. The real one is Firebase Cloud Messaging
 * (src/lib/firebase.ts); mock mode and tests pass a fake. Same idea as AuthClient: the app never
 * imports Firebase directly.
 */
export type PushClient = {
  /** This browser can get pushes at all (the Push API and notifications exist). */
  isSupported(): Promise<boolean>
  /**
   * This device's push token: the address FCM delivers to. Needs notification permission and
   * our service worker (design doc 5.7). The same token comes back until the browser rotates it.
   */
  getToken(): Promise<string>
  /**
   * Sign-out: this device's token stops working (FCM forgets it, the browser drops its push
   * subscription), so nothing reaches it until it registers again. Nothing to do if it never had
   * one.
   */
  deleteToken(): Promise<void>
}
