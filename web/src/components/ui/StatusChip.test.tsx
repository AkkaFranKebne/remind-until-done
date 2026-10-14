import { render, screen } from '@testing-library/react'
import { StatusChip } from './StatusChip'

test('shows the status label; the icon is decoration', () => {
  const { container } = render(<StatusChip status="overdue" />)

  expect(screen.getByText('Overdue')).toBeInTheDocument()
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})

test('overdue chips are purple, on a nag-high row the chip is a white pill', () => {
  const { rerender } = render(<StatusChip status="overdue" />)
  expect(screen.getByText('Overdue')).toHaveClass('bg-tag-overdue-chip')

  rerender(<StatusChip status="nagging" onNagHigh />)
  expect(screen.getByText('Nagging')).toHaveClass('bg-chip-on-nag-high', 'text-nag-high')
})
