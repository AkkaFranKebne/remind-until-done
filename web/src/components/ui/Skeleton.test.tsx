import { render } from '@testing-library/react'
import { Skeleton } from './Skeleton'

test('is decoration only, shimmers, and stands still under reduced motion', () => {
  const { container } = render(<Skeleton />)
  const block = container.firstElementChild

  expect(block).toHaveAttribute('aria-hidden', 'true')
  expect(block).toHaveClass('animate-shimmer', 'motion-reduce:animate-none', 'h-18')
})

test('takes its size from className (a tile, a label line)', () => {
  const { container } = render(<Skeleton className="h-22.5" />)

  expect(container.firstElementChild).toHaveClass('h-22.5')
  expect(container.firstElementChild).not.toHaveClass('h-18')
})
