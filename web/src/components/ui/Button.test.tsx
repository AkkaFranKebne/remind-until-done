import { fireEvent, render, screen } from '@testing-library/react'
import { Download } from 'lucide-react'
import { Button } from './Button'

test('calls onClick when clicked', () => {
  const onClick = jest.fn()
  render(<Button onClick={onClick}>Done</Button>)

  fireEvent.click(screen.getByRole('button', { name: 'Done' }))

  expect(onClick).toHaveBeenCalledTimes(1)
})

test('while loading: busy, keeps its name and focus, and ignores clicks', () => {
  const onClick = jest.fn()
  render(
    <Button loading onClick={onClick}>
      Signing in
    </Button>,
  )
  // The spinner is decorative, so the accessible name is just the text.
  const button = screen.getByRole('button', { name: 'Signing in' })

  fireEvent.click(button)

  expect(button).toHaveAttribute('aria-busy', 'true')
  expect(button).toHaveAttribute('aria-disabled', 'true')
  expect(button).not.toBeDisabled() // stays focusable for keyboard users
  expect(onClick).not.toHaveBeenCalled()
})

test('disabled buttons ignore clicks', () => {
  const onClick = jest.fn()
  render(
    <Button disabled onClick={onClick}>
      Done
    </Button>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Done' }))

  expect(onClick).not.toHaveBeenCalled()
})

test('is a plain button by default, so it never submits a form by accident', () => {
  render(<Button>Done</Button>)

  expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
})

test('shows the icon, hidden from screen readers', () => {
  const { container } = render(<Button icon={Download}>Install app</Button>)

  expect(screen.getByRole('button', { name: 'Install app' })).toBeInTheDocument()
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})

test('while loading, the spinner replaces the icon', () => {
  const { container } = render(
    <Button icon={Download} loading>
      Install app
    </Button>,
  )

  expect(container.querySelector('svg')).not.toBeInTheDocument()
  expect(container.querySelector('span[aria-hidden="true"]')).toBeInTheDocument()
})
