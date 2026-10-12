import type { Meta, StoryObj } from '@storybook/react-vite'
import { Spinner } from './Spinner'
import { TopBar } from './TopBar'
import { Wordmark } from './Wordmark'
import { CenteredScreen } from './CenteredScreen'

const meta = {
  title: 'UI/CenteredScreen',
  component: CenteredScreen,
  args: { children: null },
} satisfies Meta<typeof CenteredScreen>

export default meta
type Story = StoryObj<typeof meta>

/** No TopBar: the big wordmark is the one "rud." (Splash, Login). */
export const WithoutHeader: Story = {
  args: {
    children: (
      <>
        <Wordmark />
        <Spinner decorative />
        <output className="text-xs text-fg2">Checking your session…</output>
      </>
    ),
  },
}

/** With the TopBar logo above (404, Offline, iOS gate). */
export const WithHeader: Story = {
  args: {
    header: <TopBar showSettings={false} />,
    className: 'gap-3.5 px-7',
    children: (
      <>
        <h1 className="text-lg font-bold">Nothing here.</h1>
        <p className="text-sm text-fg2">
          Whatever you were looking for, it&apos;s not at this URL.
        </p>
      </>
    ),
  },
}
