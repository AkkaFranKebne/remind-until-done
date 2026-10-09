import { render, screen } from '@testing-library/react'
import { Spinner } from './Spinner'

test('is announced to screen readers as "Loading" by default', () => {
  render(<Spinner />)

  expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
})

test('uses the given label', () => {
  render(<Spinner label="Signing in" />)

  expect(screen.getByRole('status', { name: 'Signing in' })).toBeInTheDocument()
})

test('decorative spinners are hidden from screen readers', () => {
  render(<Spinner decorative />)

  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
