import type { PushClient } from '../lib/pushClient'

type Options = { supported?: boolean; token?: string; fails?: boolean }

/** Push for tests: supported, with a fixed token; `getTokenCalls` counts the asks. */
export class FakePushClient implements PushClient {
  getTokenCalls = 0
  private readonly options: Options

  constructor(options: Options = {}) {
    this.options = options
  }

  isSupported() {
    return Promise.resolve(this.options.supported ?? true)
  }

  getToken() {
    this.getTokenCalls++
    if (this.options.fails) return Promise.reject(new Error('no token'))
    return Promise.resolve(this.options.token ?? 'test-push-token')
  }
}
