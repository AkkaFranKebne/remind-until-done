import type { Meta, StoryObj } from '@storybook/react-vite'
import { TextLink } from './TextLink'

const meta = {
  title: 'UI/TextLink',
  component: TextLink,
  args: { href: '/privacy.html', children: 'Privacy' },
} satisfies Meta<typeof TextLink>

export default meta
type Story = StoryObj<typeof meta>

/** The login page's footer link to the privacy notice. */
export const Default: Story = {}
