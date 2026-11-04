import type { Meta, StoryObj } from '@storybook/react-vite'
import { StepsCard } from './StepsCard'

const meta = {
  title: 'UI/StepsCard',
  component: StepsCard,
  args: {
    tone: 'quiet',
    title: 'Nags say just “rud.” when locked?',
    steps: [
      <>
        Open iPhone <strong>Settings</strong>
      </>,
      <>
        Tap <strong>Apps → rud.</strong>
      </>,
      <>
        Pick <strong>Always</strong>
      </>,
    ],
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StepsCard>

export default meta
type Story = StoryObj<typeof meta>

/** A grey tip: nothing is wrong, here's something useful. */
export const Quiet: Story = {
  args: { footer: 'Your nags will be readable on the lock screen.' },
}

/** Amber: something is wrong, here's the way out. */
export const Warn: Story = {
  args: { tone: 'warn', title: 'How to turn on notifications' },
}
