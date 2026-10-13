// Adds DOM matchers like toBeInTheDocument() to expect().
import '@testing-library/jest-dom'
import { faker } from '@faker-js/faker'
import { server } from './src/mocks/server'

// jsdom has no real scrolling. TanStack Router restores the scroll position after
// every navigation, and jsdom's scrollTo only logs "Not implemented", hiding real errors.
window.scrollTo = jest.fn()

// The fake API (MSW). A request with no handler fails the test, so nothing reaches
// a real server. Same made-up data in every run (orval's mocks use faker).
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => faker.seed(1))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
