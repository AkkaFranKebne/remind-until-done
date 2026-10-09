import { fireEvent, render, screen } from '@testing-library/react'
import { Button } from './Button'

test('calls onClick when clicked', () => {
  const onClick = jest.fn()
  render(<Button onClick={onClick}>Done</Button>)

  fireEvent.click(screen.getByRole('button', { name: 'Done' }))

  expect(onClick).toHaveBeenCalledTimes(1)
})

test('while loading: shows a spinner, is busy and ignores clicks', () => {
  const onClick = jest.fn()
  render(
    <Button loading onClick={onClick}>
      Signing in
    </Button>,
  )
  const button = screen.getByRole('button', { name: /signing in/i })

  fireEvent.click(button)

  expect(button).toBeDisabled()
  expect(button).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  expect(onClick).not.toHaveBeenCalled()
})

test('is a plain button by default, so it never submits a form by accident', () => {
  render(<Button>Done</Button>)

  expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
})
