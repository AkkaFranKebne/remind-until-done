import type { Meta, StoryObj } from '@storybook/react-vite'
import { SkeletonRow } from './SkeletonRow'

const meta = { title: 'UI/SkeletonRow', component: SkeletonRow } satisfies Meta<typeof SkeletonRow>

export default meta
type Story = StoryObj<typeof meta>

/** Three rows, as the list shows while it loads for the first time. */
export const ThreeRows: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-2">
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </div>
  ),
}
