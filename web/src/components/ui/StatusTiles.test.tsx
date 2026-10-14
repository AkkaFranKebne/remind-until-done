import { fireEvent, render, screen } from '@testing-library/react'
import { StatusTiles } from './StatusTiles'

const counts = { waiting: 2, nagging: 3, overdue: 0, done: '50+' }

test('four toggle buttons with their counts; the picked one is pressed', () => {
  render(<StatusTiles counts={counts} value="nagging" onChange={jest.fn()} />)

  expect(screen.getByRole('group', { name: 'Filter reminders' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Nagging 3' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Waiting 2' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Done 50+' })).toBeInTheDocument()
})

test('tap picks a tile; tapping the picked one clears the filter', () => {
  const onChange = jest.fn()
  const { rerender } = render(<StatusTiles counts={counts} value={null} onChange={onChange} />)

  fireEvent.click(screen.getByRole('button', { name: 'Waiting 2' }))
  expect(onChange).toHaveBeenLastCalledWith('waiting')

  rerender(<StatusTiles counts={counts} value="waiting" onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Waiting 2' }))
  expect(onChange).toHaveBeenLastCalledWith(null)
})

test('a tile with 0 is muted and can not be picked', () => {
  const onChange = jest.fn()
  render(<StatusTiles counts={counts} value={null} onChange={onChange} />)

  const overdue = screen.getByRole('button', { name: 'Overdue 0' })
  fireEvent.click(overdue)

  expect(overdue).toHaveAttribute('data-disabled')
  expect(onChange).not.toHaveBeenCalled()
})
