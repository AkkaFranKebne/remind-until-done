import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Sheet, SheetDescription, SheetTitle } from './Sheet'

const meta = {
  title: 'UI/Sheet',
  component: Sheet,
  args: { open: true, onOpenChange: fn(), children: null },
} satisfies Meta<typeof Sheet>

export default meta
type Story = StoryObj<typeof meta>

/** A floating card (ConfirmSheet uses this). */
export const Card: Story = {
  args: {
    children: (
      <>
        <SheetTitle className="text-lg font-bold">A card sheet</SheetTitle>
        <SheetDescription className="text-sm text-fg2">
          Swipe it down, tap outside or press Escape.
        </SheetDescription>
      </>
    ),
  },
}

/** Attached to the bottom, peeking at 55%; drag it up to 85% (AddReminderSheet uses this). */
export const FullWithSnapPoints: Story = {
  args: {
    layout: 'full',
    snapPoints: [0.55, 0.85],
    children: (
      <div className="flex flex-col gap-3 px-5 pt-3">
        <SheetTitle className="text-lg font-bold">A form sheet</SheetTitle>
        <SheetDescription className="text-sm text-fg2">
          Drag the handle up for more room.
        </SheetDescription>
      </div>
    ),
  },
}
