import type { Meta, StoryObj } from '@storybook/react-vite'
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
