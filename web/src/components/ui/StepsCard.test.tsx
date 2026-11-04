import { render, screen, within } from '@testing-library/react'
import { StepsCard } from './StepsCard'

const steps = ['Open Settings', 'Pick Always']

test('numbers the steps in a real list, with the visible numbers hidden from screen readers', () => {
  render(<StepsCard tone="quiet" title="A tip" steps={steps} />)

  const items = within(screen.getByRole('list')).getAllByRole('listitem')
  expect(items.map((item) => item.textContent)).toEqual(['1Open Settings', '2Pick Always'])
  const [first] = items
  if (!first) throw new Error('no steps')
  expect(within(first).getByText('1')).toHaveAttribute('aria-hidden', 'true')
})

test('the title is an h3 by default, and takes another level when asked', () => {
  const { rerender } = render(<StepsCard tone="quiet" title="A tip" steps={steps} />)
  expect(screen.getByRole('heading', { level: 3, name: 'A tip' })).toBeInTheDocument()

  rerender(<StepsCard tone="quiet" title="A tip" heading="h2" steps={steps} />)
  expect(screen.getByRole('heading', { level: 2, name: 'A tip' })).toBeInTheDocument()
})

test('shows the footer only when there is one', () => {
  const { rerender } = render(<StepsCard tone="quiet" title="A tip" steps={steps} />)
  expect(screen.queryByText('One more thing.')).not.toBeInTheDocument()

  rerender(<StepsCard tone="warn" title="A tip" steps={steps} footer="One more thing." />)
  expect(screen.getByText('One more thing.')).toBeInTheDocument()
})
