import { fireEvent, render, screen } from '@testing-library/react'
import { X, SlidersHorizontal } from 'lucide-react'
import { WithRouter } from '../../test-utils/withRouter'
import { IconButton, IconLink } from './IconButton'

test('IconButton is a named button that hides its icon from screen readers', () => {
  const onClick = jest.fn()
  const { container } = render(<IconButton icon={X} label="Close" onClick={onClick} />)

  fireEvent.click(screen.getByRole('button', { name: 'Close' }))

  expect(onClick).toHaveBeenCalledTimes(1)
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})

test('IconLink is a named link to its route', async () => {
  render(
    <WithRouter>
      <IconLink to="/settings" icon={SlidersHorizontal} label="Settings" />
    </WithRouter>,
  )

  expect(await screen.findByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
})

test('takes the colour class it is given', () => {
  render(<IconButton icon={X} label="Close" className="text-tag-done-fg" />)

  expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('text-tag-done-fg')
})

test('a disabled IconButton ignores clicks', () => {
  const onClick = jest.fn()
  render(<IconButton icon={X} label="Close" disabled onClick={onClick} />)

  fireEvent.click(screen.getByRole('button', { name: 'Close' }))

  expect(onClick).not.toHaveBeenCalled()
})
