import type { Meta, StoryObj } from '@storybook/react-vite'
import { LogOut, Trash2 } from 'lucide-react'
import { type ComponentProps, useState } from 'react'
import { fn } from 'storybook/test'
import { Button } from './Button'
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
      "No notifications on this device until you're back. Anything that fires meanwhile goes straight to Overdue. We'll pretend not to notice.",
    confirmLabel: 'Sign out',
  },
} satisfies Meta<typeof ConfirmSheet>

export default meta
type Story = StoryObj<typeof meta>

/** Settings → Sign out (Inventory copy). */
export const SignOut: Story = {}

export const Confirming: Story = { args: { confirming: true } }

/** An extra warning in a grey box, under the text. */
export const WithNote: Story = { args: { note: "This can't be undone." } }

/** Throwing something away: red confirm button (Inventory → UX Copy "Discard draft"). */
export const Danger: Story = {
  args: {
    icon: Trash2,
    title: 'Forget this one?',
    children: "You'll lose what you typed. Ironic, for a reminder app.",
    confirmLabel: 'Discard',
    cancelLabel: 'Keep editing',
    danger: true,
  },
}

function InteractiveDemo(args: ComponentProps<typeof ConfirmSheet>) {
  const [open, setOpen] = useState(false)
  return (
    <div className="p-4">
      <Button onClick={() => setOpen(true)}>Sign out</Button>
      <ConfirmSheet {...args} open={open} onOpenChange={setOpen} onConfirm={() => setOpen(false)} />
    </div>
  )
}

/** Try it like on a phone: open it, then close it with Cancel, a tap outside, Escape or a swipe down. */
export const Interactive: Story = { render: (args) => <InteractiveDemo {...args} /> }
