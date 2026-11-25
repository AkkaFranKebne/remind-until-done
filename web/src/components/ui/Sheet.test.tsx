import { Input } from '@base-ui/react/input'
import { createRef } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Sheet, SheetDescription, SheetTitle } from './Sheet'

function renderSheet(props: Partial<Parameters<typeof Sheet>[0]> = {}) {
  const onOpenChange = jest.fn()
  render(
    <Sheet open onOpenChange={onOpenChange} {...props}>
      <SheetTitle>Set the trap</SheetTitle>
      <SheetDescription>What are you forgetting?</SheetDescription>
    </Sheet>,
  )
  return { onOpenChange }
}

test('is a dialog named by its title and described by its text', () => {
  renderSheet()

  expect(screen.getByRole('dialog', { name: 'Set the trap' })).toHaveAccessibleDescription(
    'What are you forgetting?',
  )
})

test('Escape asks to close', () => {
  const { onOpenChange } = renderSheet()

  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('can be an alert dialog', () => {
  renderSheet({ role: 'alertdialog' })

  expect(screen.getByRole('alertdialog', { name: 'Set the trap' })).toBeInTheDocument()
})

test('with snap points it is the tall form sheet', () => {
  renderSheet({ layout: 'full', snapPoints: [0.85, 1] })

  expect(screen.getByRole('dialog')).toHaveClass('sheet-tall', 'rounded-t-lg')
})

const tapOutside = () => {
  fireEvent.pointerDown(document.body)
  fireEvent.mouseDown(document.body)
  fireEvent.pointerUp(document.body)
  fireEvent.mouseUp(document.body)
  fireEvent.click(document.body)
}

test('a tap outside asks to close, unless it is not dismissible, which also has no handle bar', async () => {
  const onOpenChange = jest.fn()
  const { rerender } = render(
    <Sheet open onOpenChange={onOpenChange}>
      <SheetTitle>Title</SheetTitle>
    </Sheet>,
  )
  const dialog = await screen.findByRole('dialog')
  expect(dialog.querySelector('[aria-hidden="true"]')).not.toBeNull()
  tapOutside()
  await waitFor(() => expect(onOpenChange).toHaveBeenCalled())

  onOpenChange.mockClear()
  rerender(
    <Sheet open onOpenChange={onOpenChange} dismissible={false}>
      <SheetTitle>Title</SheetTitle>
    </Sheet>,
  )
  expect(dialog).toHaveAttribute('data-base-ui-swipe-ignore')
  expect(dialog.querySelector('[aria-hidden="true"]')).toBeNull()
  tapOutside()
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
  expect(onOpenChange).not.toHaveBeenCalled()
})

test('focusAfterSlideIn: the sheet has focus while it slides in, then the field gets it', async () => {
  const focused: string[] = []
  const track = (e: FocusEvent) => {
    if (e.target instanceof HTMLElement) focused.push(e.target.getAttribute('aria-label') ?? '')
  }
  document.addEventListener('focusin', track)
  const fieldRef = createRef<HTMLElement>()
  render(
    <Sheet open onOpenChange={jest.fn()} initialFocus={fieldRef} focusAfterSlideIn>
      <SheetTitle>Set the trap</SheetTitle>
      <Input aria-label="Title" ref={fieldRef} />
    </Sheet>,
  )

  // No transition in jsdom: the slide-in ends at once, before Base UI's first focus, which then
  // leaves focus where it is. In a browser the sheet gets it first (e2e/reminders.spec.ts).
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus())
  expect(focused.at(-1)).toBe('Title')
  document.removeEventListener('focusin', track)
})
