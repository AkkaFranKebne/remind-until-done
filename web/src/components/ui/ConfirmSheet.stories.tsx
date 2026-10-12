import type { Meta, StoryObj } from '@storybook/react-vite'
import { LogOut } from 'lucide-react'
import { fn } from 'storybook/test'
import { ConfirmSheet } from './ConfirmSheet'

const meta = {
  title: 'UI/ConfirmSheet',
  component: ConfirmSheet,
  args: {
    open: true,
    onOpenChange: fn(),
    onConfirm: fn(),
    icon: LogOut,
    title: 'Sign out?',
    children:
      "Signing out stops all notifications on this phone. Any reminder that fires while you're signed out will go straight to Overdue.",
    note: "You'll need to reinstall the app to sign back in on this device.",
    confirmLabel: 'Sign out',
  },
} satisfies Meta<typeof ConfirmSheet>

export default meta
type Story = StoryObj<typeof meta>

/** Settings → Sign out (Inventory copy). */
export const SignOut: Story = {}

export const Confirming: Story = { args: { confirming: true } }

export const WithoutNote: Story = { args: { note: undefined } }
