import type { Meta, StoryObj } from '@storybook/react-vite'
import { Download, House } from 'lucide-react'
import { Button } from './Button'

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { children: 'Done' },
  decorators: [
    (Story) => (
      <div className="flex gap-2.5 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {}
export const Ghost: Story = { args: { variant: 'ghost', children: 'Remind later' } }
export const Loading: Story = { args: { loading: true, children: 'Signing in' } }
export const Disabled: Story = { args: { disabled: true } }
export const GhostLoading: Story = { args: { variant: 'ghost', loading: true, children: 'Saving' } }
export const GhostDisabled: Story = {
  args: { variant: 'ghost', disabled: true, children: 'Remind later' },
}

/** Icon before the text (any Lucide icon). */
export const WithIcon: Story = { args: { icon: House, children: 'Go home' } }

/** lg: the one hero action on a screen. */
export const Large: Story = { args: { size: 'lg', icon: Download, children: 'Install app' } }

/** While loading, the spinner takes the icon's place, so the text doesn't move. */
export const LargeLoading: Story = {
  args: { size: 'lg', icon: Download, loading: true, children: 'Install app' },
}
