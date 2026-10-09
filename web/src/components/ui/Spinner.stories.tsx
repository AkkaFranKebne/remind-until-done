import type { Meta, StoryObj } from '@storybook/react-vite'
import { Spinner } from './Spinner'

const meta = {
  title: 'UI/Spinner',
  component: Spinner,
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Spinner>

export default meta
type Story = StoryObj<typeof meta>

export const Medium: Story = {}
export const Small: Story = { args: { size: 'sm' } }
export const OnAccent: Story = {
  args: { onAccent: true },
  decorators: [
    (Story) => (
      <div className="inline-flex rounded-md bg-accent p-3">
        <Story />
      </div>
    ),
  ],
}
