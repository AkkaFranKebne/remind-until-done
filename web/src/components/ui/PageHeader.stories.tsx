import type { Meta, StoryObj } from '@storybook/react-vite'
import { PageHeader } from './PageHeader'

const meta = {
  title: 'UI/PageHeader',
  component: PageHeader,
  args: { title: 'Settings', backTo: '/' },
  decorators: [
    (Story) => (
      <div className="px-4 pt-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PageHeader>

export default meta
type Story = StoryObj<typeof meta>

/** ‹ Back + title, under the TopBar of a signed-in page. */
export const Default: Story = {}

export const LongTitle: Story = { args: { title: 'Call the bank about the mortgage' } }
