// Adds DOM matchers like toBeInTheDocument() to expect().
import '@testing-library/jest-dom'
import { faker } from '@faker-js/faker'
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

// The fake API (MSW). A request with no handler fails the test, so nothing reaches
// a real server. Same made-up data in every run (orval's mocks use faker).
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => faker.seed(1))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
