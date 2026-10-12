import { render, screen } from '@testing-library/react'
import { Wordmark } from './Wordmark'

test('shows "rud." as a paragraph by default', () => {
  render(<Wordmark />)

  expect(screen.getByText('rud.').tagName).toBe('P')
})

test('can be the page heading', () => {
  render(<Wordmark as="h1" />)

  expect(screen.getByRole('heading', { level: 1, name: 'rud.' })).toBeInTheDocument()
})

test('uses the display size from the type scale', () => {
  render(<Wordmark />)

  expect(screen.getByText('rud.')).toHaveClass('text-display', 'text-accent')
})
