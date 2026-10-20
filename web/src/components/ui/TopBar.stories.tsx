import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { TopBar } from './TopBar'

const meta = {
  title: 'UI/TopBar',
  component: TopBar,
  parameters: {
    docs: {
      description: {
        component:
          'App header on every screen: logo left, Settings right, no background of its own. `tone` sets the icon colour for the screen behind it. Design Inventory → Components → "TopBar + context line" and the Phone Screens.',
      },
    },
  },
} satisfies Meta<typeof TopBar>

export default meta
type Story = StoryObj<typeof meta>

/** Phone-height screen with a gradient, like the real list and detail screens. */
function Screen({ gradient, children }: { gradient: string; children: ReactNode }) {
  return <div className={`h-screen ${gradient}`}>{children}</div>
}

/** Plain page background: settings, simple screens. */
export const Plain: Story = {}

/** With the state-based line underneath (list screen). */
export const WithContextLine: Story = {
  args: { tone: 'brand', contextLine: '3 things need your attention.' },
  decorators: [(Story) => <Screen gradient="bg-(image:--grad-shell-brand)">{Story()}</Screen>],
}

/** Login, offline, iOS gate, 404: nobody is signed in, so no Settings icon. */
export const LogoOnly: Story = { args: { showSettings: false } }

export const Brand: Story = {
  args: { tone: 'brand' },
  decorators: [(Story) => <Screen gradient="bg-(image:--grad-shell-brand)">{Story()}</Screen>],
}

/** The reminder page: each state's gradient with its tone. */
export const Waiting: Story = {
  args: { tone: 'waiting' },
  decorators: [(Story) => <Screen gradient="bg-(image:--grad-detail-waiting)">{Story()}</Screen>],
}

export const NagLow: Story = {
  args: { tone: 'nag-low' },
  decorators: [(Story) => <Screen gradient="bg-(image:--grad-detail-nag-low)">{Story()}</Screen>],
}

export const NagMid: Story = {
  args: { tone: 'nag-mid' },
  decorators: [(Story) => <Screen gradient="bg-(image:--grad-detail-nag-mid)">{Story()}</Screen>],
}

export const NagHigh: Story = {
  args: { tone: 'nag-high' },
  decorators: [(Story) => <Screen gradient="bg-(image:--grad-detail-nag-high)">{Story()}</Screen>],
}

export const Overdue: Story = {
  args: { tone: 'overdue' },
  decorators: [(Story) => <Screen gradient="bg-(image:--grad-detail-overdue)">{Story()}</Screen>],
}

export const Done: Story = {
  args: { tone: 'done' },
  decorators: [(Story) => <Screen gradient="bg-(image:--grad-detail-done)">{Story()}</Screen>],
}
