import type { Meta, StoryObj } from '@storybook/react-vite'
import { Bell, BellOff, Download, Smartphone, X } from 'lucide-react'
import { Banner, BannerButton, BannerLink } from './Banner'
import { IconButton } from './IconButton'

const meta = {
  title: 'UI/Banner',
  component: Banner,
  args: {
    label: 'Turn on notifications',
    icon: Bell,
    children: 'Enable notifications so we can nag you.',
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Banner>

export default meta
type Story = StoryObj<typeof meta>

/** NotifBanner: an action and Later. */
export const ActionAndLater: Story = {
  args: {
    actions: (
      <>
        <BannerButton>Enable</BannerButton>
        <BannerButton quiet>Later</BannerButton>
      </>
    ),
  },
}

/** While the action runs: a spinner over its label, still focusable. */
export const Busy: Story = {
  args: {
    actions: (
      <>
        <BannerButton busy>Enable</BannerButton>
        <BannerButton quiet>Later</BannerButton>
      </>
    ),
  },
}

/** An action that goes to another page is a link. */
export const WithLink: Story = {
  args: {
    label: 'Notifications are blocked',
    icon: BellOff,
    children: "Notifications are blocked. Here's how to fix it.",
    actions: (
      <>
        <BannerLink to="/settings">Show me</BannerLink>
        <BannerButton quiet>Later</BannerButton>
      </>
    ),
  },
}

/** NotifBanner when another device has the pushes: the longest action label, at a small phone's width. */
export const PushesElsewhere: Story = {
  args: {
    label: 'Pushes go to another device',
    icon: Smartphone,
    children: "Pushes won't reach you here.",
    actions: (
      <>
        <BannerButton>Use this device</BannerButton>
        <BannerButton quiet>Later</BannerButton>
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div className="max-w-80">
        <Story />
      </div>
    ),
  ],
}

/** InstallBanner: the action and ✕. `live`: the line is a status, announced when it changes. */
export const Dismissible: Story = {
  args: {
    live: true,
    label: 'Install the app',
    icon: Download,
    children: 'Install rud. to get push notifications',
    actions: (
      <>
        <BannerButton>Install</BannerButton>
        <IconButton icon={X} size="sm" label="Hide for a week" className="text-fg2" />
      </>
    ),
  },
}

/** A line only (no button), and ✕. */
export const LongLine: Story = {
  args: {
    label: 'Install the app',
    icon: Download,
    children:
      'Push notifications need the installed app. Already installed? Open rud. from your apps.',
    actions: <IconButton icon={X} size="sm" label="Hide for a week" className="text-fg2" />,
  },
}
