import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import type { ReminderStatusKind } from './status'
import { StatusTiles } from './StatusTiles'

function Controlled({
  initial,
  counts,
}: {
  initial: ReminderStatusKind | null
  counts: Parameters<typeof StatusTiles>[0]['counts']
}) {
  const [value, setValue] = useState(initial)
  return <StatusTiles counts={counts} value={value} onChange={setValue} className="max-w-sm" />
}

const meta = {
  title: 'UI/StatusTiles',
  component: StatusTiles,
  args: {
    counts: { waiting: 2, nagging: 3, overdue: 0, done: 7 },
    value: null,
    onChange: () => {},
  },
} satisfies Meta<typeof StatusTiles>

export default meta
type Story = StoryObj<typeof meta>

/** No tile picked: the list shows all active reminders. Overdue is 0, so it's muted. */
export const NonePicked: Story = {
  render: (args) => <Controlled initial={null} counts={args.counts} />,
}

export const NaggingPicked: Story = {
  render: (args) => <Controlled initial="nagging" counts={args.counts} />,
}

export const WaitingPicked: Story = {
  render: (args) => <Controlled initial="waiting" counts={args.counts} />,
}

/** The picked Overdue tile gets the ember ring, like an overdue row (decision 65). */
export const OverduePicked: Story = {
  render: (args) => <Controlled initial="overdue" counts={{ ...args.counts, overdue: 2 }} />,
}

/** Done picked: the rows' frame in green. */
export const DonePicked: Story = {
  render: (args) => <Controlled initial="done" counts={args.counts} />,
}
