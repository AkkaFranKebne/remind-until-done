import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChevronLeft, SlidersHorizontal, X } from 'lucide-react'
import { IconButton, IconLink } from './IconButton'

const meta = {
  title: 'UI/IconButton',
  component: IconButton,
  args: { icon: X, label: 'Close' },
  decorators: [
    (Story) => (
      <div className="flex gap-2.5 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IconButton>

export default meta
type Story = StoryObj<typeof meta>

/** Close: an action, so an IconButton (Base UI button). */
export const Close: Story = {}

/** Settings and Back navigate, so they are real links (IconLink), with the same look. */
export const Links: Story = {
  render: () => (
    <>
      <IconLink to="/settings" icon={SlidersHorizontal} label="Settings" />
      <IconLink to="/" icon={ChevronLeft} label="Back" />
    </>
  ),
}

/** The icon takes the text colour you pass, e.g. the screen's tone on a gradient. */
export const Coloured: Story = {
  args: { icon: SlidersHorizontal, label: 'Settings', className: 'text-tag-done-fg' },
}

export const Disabled: Story = { args: { disabled: true } }
