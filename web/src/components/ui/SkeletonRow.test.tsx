import { render } from '@testing-library/react'
import { SkeletonRow } from './SkeletonRow'

test('is decoration only, shimmers, and stands still under reduced motion', () => {
  const { container } = render(<SkeletonRow />)
  const row = container.firstElementChild

  expect(row).toHaveAttribute('aria-hidden', 'true')
  expect(row).toHaveClass('animate-shimmer', 'motion-reduce:animate-none', 'h-20')
})
