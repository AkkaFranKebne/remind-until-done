import { render, screen } from '@testing-library/react'
import { TextLink } from './TextLink'

test('is a plain link to the address, with a 44px tap area', () => {
  render(<TextLink href="/privacy.html">Privacy</TextLink>)

  const link = screen.getByRole('link', { name: 'Privacy' })
  expect(link).toHaveAttribute('href', '/privacy.html')
  expect(link).toHaveClass('min-h-11', 'underline')
})
