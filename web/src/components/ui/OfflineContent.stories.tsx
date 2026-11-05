import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { OfflineMessage } from './OfflineContent'

const meta = {
  title: 'UI/OfflineContent',
  component: OfflineMessage,
  args: { onTryAgain: fn() },
  decorators: [
    (Story) => (
      <div className="flex min-h-96 flex-col p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OfflineMessage>

export default meta
type Story = StoryObj<typeof meta>

/** In place of a page's content, under the TopBar. */
export const Default: Story = {}

/** The user tapped Try again. The checks on the timer don't show like this. */
export const Checking: Story = { args: { checking: true } }
