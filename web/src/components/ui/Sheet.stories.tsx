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

/** Only the owner's own button closes it: no handle bar, and swipes and taps outside do nothing. */
export const NotDismissible: Story = {
  args: {
    dismissible: false,
    children: (
      <>
        <SheetTitle className="text-lg font-bold">A sheet that stays</SheetTitle>
        <SheetDescription className="text-sm text-fg2">Delete account uses this.</SheetDescription>
      </>
    ),
  },
}

/** Attached to the bottom, opening at 85%; drag it up to full height (AddReminderSheet uses this). */
export const FullWithSnapPoints: Story = {
  args: {
    layout: 'full',
    snapPoints: [0.85, 1],
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
