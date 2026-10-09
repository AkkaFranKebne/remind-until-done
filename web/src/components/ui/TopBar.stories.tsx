import type { Meta, StoryObj } from '@storybook/react-vite'
import { TopBar } from './TopBar'

const meta = {
  title: 'UI/TopBar',
  component: TopBar,
  parameters: {
    docs: {
      description: {
        component:
          'App header on every screen. Logo left, Settings right. Design Inventory → Components → "TopBar + context line".',
      },
    },
  },
} satisfies Meta<typeof TopBar>

export default meta
type Story = StoryObj<typeof meta>

/** Signed-in pages (settings, simple screens). */
export const Surface: Story = {}

/** With the state-based line underneath (list screen). */
export const WithContextLine: Story = {
  args: { contextLine: '3 things need your attention.' },
}

/** Over a gradient: the list and reminder detail screens. */
export const Transparent: Story = {
  args: { variant: 'transparent', contextLine: 'Nothing nagging you yet.' },
  decorators: [
    (Story) => (
      <div className="min-h-40 bg-(image:--grad-shell-brand)">
        <Story />
      </div>
    ),
  ],
}

/** Login, offline and iOS-gate screens: nobody is signed in, so no Settings icon. */
export const LogoOnly: Story = {
  args: { showSettings: false },
}
