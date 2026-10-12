import { fireEvent, render, screen } from '@testing-library/react'
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
      note="You'll need to reinstall the app to sign back in on this device."
      confirmLabel="Sign out"
      {...props}
    >
      Signing out stops all notifications on this phone.
    </ConfirmSheet>,
  )
  return { onOpenChange, onConfirm }
}

test('is an alert dialog named by its title and described by its text', () => {
  renderSheet()

  const dialog = screen.getByRole('alertdialog', { name: 'Sign out?' })
  expect(dialog).toHaveAccessibleDescription('Signing out stops all notifications on this phone.')
  expect(screen.getByText(/reinstall the app/)).toBeInTheDocument()
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
