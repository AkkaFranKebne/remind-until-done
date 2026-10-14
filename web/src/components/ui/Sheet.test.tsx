import { fireEvent, render, screen } from '@testing-library/react'
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
  renderSheet({ layout: 'full', snapPoints: [0.55, 0.85] })

  expect(screen.getByRole('dialog')).toHaveClass('sheet-tall', 'rounded-t-lg')
})
