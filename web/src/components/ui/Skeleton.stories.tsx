import type { Meta, StoryObj } from '@storybook/react-vite'
import { Skeleton } from './Skeleton'

const meta = { title: 'UI/Skeleton', component: Skeleton } satisfies Meta<typeof Skeleton>

export default meta
type Story = StoryObj<typeof meta>

/** A row placeholder (72px, the reminder row's height). */
export const Row: Story = { args: { className: 'max-w-sm' } }

/** Shapes the list uses while loading: a tile, a label line, a row. */
export const Shapes: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-3">
      <Skeleton className="h-22.5 w-1/2" />
      <Skeleton className="h-3 w-32 rounded-sm" />
      <Skeleton />
    </div>
  ),
}
