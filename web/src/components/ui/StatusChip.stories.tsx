import type { Meta, StoryObj } from '@storybook/react-vite'
import { StatusChip } from './StatusChip'

const meta = {
  title: 'UI/StatusChip',
  component: StatusChip,
  args: { status: 'waiting' },
} satisfies Meta<typeof StatusChip>

export default meta
type Story = StoryObj<typeof meta>

export const All: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <StatusChip status="waiting" />
        <StatusChip status="nagging" />
        <StatusChip status="overdue" />
        <StatusChip status="done" />
      </div>
      <div className="flex gap-2">
        <StatusChip size="sm" status="nagging" />
        <StatusChip size="sm" status="overdue" />
      </div>
      <div className="flex gap-2 rounded-md bg-nag-high p-3">
        <StatusChip size="sm" status="nagging" onNagHigh />
      </div>
    </div>
  ),
}
