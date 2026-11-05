// Adds DOM matchers like toBeInTheDocument() to expect().
import '@testing-library/jest-dom'
import { faker } from '@faker-js/faker'
import { onlineManager } from '@tanstack/react-query'
import { server } from './src/mocks/server'

// jsdom has no real scrolling. TanStack Router restores the scroll position after
// every navigation, and jsdom's scrollTo only logs "Not implemented", hiding real errors.
window.scrollTo = jest.fn()

// jsdom has no PointerEvent; Base UI's Radio creates one when clicked. A MouseEvent with a
// pointerType is enough for tests.
if (!('PointerEvent' in window)) {
  class PointerEvent extends MouseEvent {
    readonly pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerType = init.pointerType ?? 'mouse'
    }
  }
  Object.assign(window, { PointerEvent })
}

// TEST_CLOCK_SHIFT_H=12 starts every test's clock that many hours later (CI runs the tests a
// second time like this). A test that reads the clock and only passes at some hours of the day
// then fails on the PR, not on whichever run happens at the wrong hour. Only Date moves; timers
// stay real. A test that fakes timers itself sets its own clock.
declare const CLOCK_SHIFT_H: number // from jest.config.js
if (CLOCK_SHIFT_H) {
  // sinon swaps out Intl along with Date, which would hide a test's time zone mock: put it back.
  const realIntl = Intl
  beforeEach(() => {
    jest.useFakeTimers({
      now: Date.now() + CLOCK_SHIFT_H * 3_600_000,
      advanceTimers: true,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    })
    globalThis.Intl = realIntl
  })
  afterEach(() => jest.useRealTimers())
}

// The fake API (MSW). A request with no handler fails the test, so nothing reaches
// a real server. Same made-up data in every run (orval's mocks use faker).
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => faker.seed(1))
afterEach(() => {
  server.resetHandlers()
  onlineManager.setOnline(true) // it lives outside React, so it outlives the test
})
afterAll(() => server.close())
