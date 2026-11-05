import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LogOut } from 'lucide-react'
import { ConfirmSheet } from './ConfirmSheet'

function renderSheet(props: Partial<Parameters<typeof ConfirmSheet>[0]> = {}) {
  const onOpenChange = jest.fn()
  const onConfirm = jest.fn()
  render(
    <ConfirmSheet
      open
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      icon={LogOut}
      title="Sign out?"
      note="This can't be undone."
      confirmLabel="Sign out"
      {...props}
    >
      No notifications on this device until you're back.
    </ConfirmSheet>,
  )
  return { onOpenChange, onConfirm }
}

test('is an alert dialog named by its title and described by its text', () => {
  renderSheet()

  const dialog = screen.getByRole('alertdialog', { name: 'Sign out?' })
  expect(dialog).toHaveAccessibleDescription("No notifications on this device until you're back.")
  expect(screen.getByText("This can't be undone.")).toBeInTheDocument()
})

test('confirm runs the action', () => {
  const { onConfirm } = renderSheet()

  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

  expect(onConfirm).toHaveBeenCalledTimes(1)
})

test('cancel closes it without running the action', () => {
  const { onConfirm, onOpenChange } = renderSheet()

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(onOpenChange).toHaveBeenCalledWith(false)
  expect(onConfirm).not.toHaveBeenCalled()
})

test('while confirming: the confirm button is busy and ignores more clicks', () => {
  const { onConfirm } = renderSheet({ confirming: true })
  const button = screen.getByRole('button', { name: 'Sign out' })

  fireEvent.click(button)

  expect(button).toHaveAttribute('aria-busy', 'true')
  expect(onConfirm).not.toHaveBeenCalled()
})

test('shows nothing when closed', () => {
  renderSheet({ open: false })

  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

test('focus starts on Cancel, so a reflexive Enter does not run the action', async () => {
  renderSheet()

  await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())
})

test('a tap outside the sheet closes it', async () => {
  const { onOpenChange } = renderSheet()
  await screen.findByRole('alertdialog')

  fireEvent.pointerDown(document.body)
  fireEvent.mouseDown(document.body)
  fireEvent.click(document.body)

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
})

test('while confirming, a tap outside does not close it', async () => {
  const { onOpenChange } = renderSheet({ confirming: true })
  await screen.findByRole('alertdialog')

  fireEvent.pointerDown(document.body)
  fireEvent.mouseDown(document.body)
  fireEvent.click(document.body)

  expect(onOpenChange).not.toHaveBeenCalled()
})

test('cancelOnly: Escape does not close it, Cancel does, and confirmDisabled locks the button', () => {
  const onOpenChange = jest.fn()
  render(
    <ConfirmSheet
      open
      onOpenChange={onOpenChange}
      icon={LogOut}
      title="Delete your account?"
      confirmLabel="Delete"
      confirmDisabled
      cancelOnly
      onConfirm={() => {}}
    >
      Everything goes.
    </ConfirmSheet>,
  )
  const sheet = screen.getByRole('alertdialog')

  fireEvent.keyDown(sheet, { key: 'Escape' })
  expect(onOpenChange).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
