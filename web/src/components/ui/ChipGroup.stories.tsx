import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ChipGroup, type ChipOption } from './ChipGroup'

const intervals: ChipOption<string>[] = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '60', label: '1 h' },
  { value: '120', label: '2 h' },
  { value: '240', label: '4 h' },
  { value: '720', label: '12 h' },
  { value: '1440', label: '24 h' },
]

function Controlled({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial)
  return (
    <ChipGroup legend="Then nag me every" options={intervals} value={value} onChange={setValue} />
  )
}

const meta = {
  title: 'UI/ChipGroup',
  component: ChipGroup,
  args: { legend: 'Then nag me every', options: intervals, value: '60', onChange: () => {} },
} satisfies Meta<typeof ChipGroup>

export default meta
type Story = StoryObj<typeof meta>

/** IntervalChips: 15 min to 24 h, one picked. */
export const Interval: Story = { render: () => <Controlled initial="60" /> }

/** Nothing picked yet (TimeChips before a choice). */
export const NothingPicked: Story = { render: () => <Controlled initial={null} /> }
