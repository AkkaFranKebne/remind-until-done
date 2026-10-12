// Adds DOM matchers like toBeInTheDocument() to expect().
import '@testing-library/jest-dom'

// jsdom has no real scrolling. TanStack Router restores the scroll position after
// every navigation, and jsdom's scrollTo only logs "Not implemented", hiding real errors.
window.scrollTo = jest.fn()
