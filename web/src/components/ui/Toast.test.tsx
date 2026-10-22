import { act, fireEvent, render, screen } from '@testing-library/react'
import { Button } from './Button'
import { ToastProvider } from './Toast'
import { useToast } from './useToast'

function Trigger() {
  const toast = useToast()
  return (
    <>
      <Button onClick={() => toast.success('Finally. Done.')}>Done</Button>
      <Button onClick={() => toast.error('Something went wrong. Try again in a moment.')}>
        Fail
      </Button>
    </>
  )
}

function renderToasts() {
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  )
}

test('success: green, with a check, and it goes away by itself', () => {
  jest.useFakeTimers()
  renderToasts()

  fireEvent.click(screen.getByRole('button', { name: 'Done' }))

  const message = screen.getByText('Finally. Done.')
  expect(message.closest('[class*="bg-tag-done"]')).not.toBeNull()

  act(() => {
    jest.advanceTimersByTime(5000)
  })
  expect(screen.queryByText('Finally. Done.')).not.toBeInTheDocument()
  jest.useRealTimers()
})

test('error: red; a new toast replaces the one before', () => {
  renderToasts()

  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  fireEvent.click(screen.getByRole('button', { name: 'Fail' }))

  expect(
    screen
      .getByText('Something went wrong. Try again in a moment.')
      .closest('[class*="text-tag-nagging-fg"]'),
  ).not.toBeNull()
  // One at a time: the older one is hidden (Base UI marks it data-limited).
  expect(screen.getByText('Finally. Done.').closest('[data-limited]')).not.toBeNull()
})

test('the toast area is named "Messages" (Settings has a section called Notifications)', () => {
  renderToasts()
  expect(screen.getByRole('region', { name: 'Messages' })).toBeInTheDocument()
})
