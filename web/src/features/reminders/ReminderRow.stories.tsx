import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Reminder } from '../../lib/api/generated/model'
import { WithRouter } from '../../test-utils/withRouter'
import { ReminderRow } from './ReminderRow'

const now = new Date('2026-10-14T10:00:00Z')

function reminder(id: string, title: string, over: Partial<Reminder>): Reminder {
  return {
    id,
    title,
    dueAt: '2026-10-15T09:00:00Z',
    status: 'pending',
    createdAt: '2026-10-14T08:00:00Z',
    updatedAt: '2026-10-14T08:00:00Z',
    nagIntervalMin: 60,
    nagCount: 0,
    nagsExhausted: false,
    ...over,
  }
}

const all = [
  reminder('1', 'Book a plumber', {}),
  reminder('2', 'Call dentist', { status: 'sent', nagCount: 2 }),
  reminder('3', 'Reply to landlord', { status: 'sent', nagCount: 5 }),
  reminder('4', 'File tax return', { status: 'sent', nagCount: 10 }),
  reminder('5', 'Renew passport', { status: 'sent', nagCount: 12, nagsExhausted: true }),
  reminder('6', 'Buy birthday card', { status: 'done', doneAt: '2026-10-09T10:00:00Z' }),
]

const meta = {
  title: 'Reminders/ReminderRow',
  component: ReminderRow,
  decorators: [(Story) => <WithRouter>{Story()}</WithRouter>],
  args: { reminder: reminder('1', 'Book a plumber', {}), now },
} satisfies Meta<typeof ReminderRow>

export default meta
type Story = StoryObj<typeof meta>

/** Every variant, stacked like the list (−8px overlap). Light + dark: the tints stay the same. */
export const AllVariants: Story = {
  render: () => (
    <ul className="flex max-w-sm flex-col">
      {all.map((r, i) => (
        // Later rows paint over earlier ones by themselves (normal flow), so no z-index.
        <li key={r.id} className={i > 0 ? '-mt-2' : undefined}>
          <ReminderRow reminder={r} now={now} />
        </li>
      ))}
    </ul>
  ),
}

export const LongTitle: Story = {
  args: {
    reminder: reminder(
      '7',
      'Ask the landlord about the broken radiator in the bedroom before winter',
      {},
    ),
  },
}
