import type { Meta, StoryObj } from '@storybook/react-vite'
import { Wordmark } from './Wordmark'

const meta = {
  title: 'UI/Wordmark',
  component: Wordmark,
  decorators: [
    (Story) => (
      <div className="flex justify-center p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Wordmark>

export default meta
type Story = StoryObj<typeof meta>

/** Login and splash: the one "rud." on the screen. */
export const Default: Story = {}

export const AsPageHeading: Story = { args: { as: 'h1' } }
