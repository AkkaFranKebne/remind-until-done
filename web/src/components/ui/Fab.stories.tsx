import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus } from 'lucide-react'
import { fn } from 'storybook/test'
import { Fab } from './Fab'

const meta = {
  title: 'UI/Fab',
  component: Fab,
  args: { icon: Plus, label: 'Add reminder', onClick: fn() },
} satisfies Meta<typeof Fab>

export default meta
type Story = StoryObj<typeof meta>

/** Fixed bottom-right, above the home bar. */
export const AddReminder: Story = {}
