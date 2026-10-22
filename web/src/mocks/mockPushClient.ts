import type { PushClient } from '../lib/pushClient'

/**
 * Push for `npm run dev:mock`, instead of Firebase Cloud Messaging: a fixed token, so
 * "Enable notifications" registers with the fake API (devDevicesApi.ts). The browser's own
 * permission prompt is real. No push ever arrives (use the dev site for that).
 */
export class MockPushClient implements PushClient {
  isSupported() {
    return Promise.resolve('Notification' in window)
  }

  getToken() {
    return Promise.resolve('mock-push-token')
  }
}
