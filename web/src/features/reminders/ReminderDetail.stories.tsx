import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import type { Reminder } from '../../lib/api/generated/model'
import { WithRouter } from '../../test-utils/withRouter'
import { ReminderDetail } from './ReminderDetail'

const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

function reminder(over: Partial<Reminder>): Reminder {
  return {
    id: 'r1',
    title: 'File tax return',
    dueAt: new Date(Date.now() + 2 * day + 4 * hour + 30_000).toISOString(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nagIntervalMin: 60,
    nagCount: 0,
    nagsExhausted: false,
    ...over,
  }
}

const nagging = (nagCount: number): Partial<Reminder> => ({
  status: 'sent',
  nagCount,
  dueAt: new Date(Date.now() - nagCount * hour).toISOString(),
  nextNagAt: new Date(Date.now() + 42 * minute + 17_000).toISOString(),
})

/** A query client for the page's buttons (Done, edit, delete); nothing is fetched. */
function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={client}>
      <WithRouter>{children}</WithRouter>
    </QueryClientProvider>
  )
}

const meta = {
  title: 'Reminders/ReminderDetail',
  component: ReminderDetail,
  parameters: { layout: 'fullscreen' },
  args: { reminder: reminder({}), defaultTimeOfDay: '09:00' },
  decorators: [(Story) => <Providers>{Story()}</Providers>],
} satisfies Meta<typeof ReminderDetail>

export default meta
type Story = StoryObj<typeof meta>

/** Before the first push: counts down to it. */
export const Waiting: Story = {}

/** The last minute before the first push: "Starting now", big and pulsing. */
export const StartingNow: Story = {
  args: { reminder: reminder({ dueAt: new Date(Date.now() + 40_000).toISOString() }) },
}

/** A nag going out: 00:00:00 pulses until the push arrives and the page moves on. */
export const PushDue: Story = { args: { reminder: reminder({ ...nagging(3), nextNagAt: null }) } }

/** Pushes 1–3. */
export const NagLow: Story = { args: { reminder: reminder(nagging(2)) } }

/** Pushes 4–8: the countdown ticks to the second. */
export const NagMid: Story = { args: { reminder: reminder(nagging(4)) } }

/** Pushes 9–11. */
export const NagHigh: Story = { args: { reminder: reminder(nagging(10)) } }

/** All 12 pushes sent without a Done: how late, from the due time. */
export const Overdue: Story = {
  args: {
    reminder: reminder({
      status: 'sent',
      nagCount: 12,
      nagsExhausted: true,
      dueAt: new Date(Date.now() - 3 * day - 14 * hour - 22 * minute).toISOString(),
    }),
  },
}

/** Done: read-only, with what it took. */
export const Done: Story = {
  args: {
    reminder: reminder({
      status: 'done',
      nagCount: 4,
      dueAt: new Date(Date.now() - 3 * hour).toISOString(),
      doneAt: new Date().toISOString(),
    }),
  },
}

/** With a note: under the title, line breaks kept. The funny line sits at the bottom. */
export const WithNote: Story = {
  args: {
    reminder: reminder({
      ...nagging(5),
      title: 'Call the bank',
      note: 'Account no. is in the blue folder.\nAsk about the transfer fee.',
    }),
  },
}

/** A long title wraps (up to 200 characters). */
export const LongTitle: Story = {
  args: {
    reminder: reminder({
      ...nagging(5),
      title: 'Call the insurance company about the windscreen before the excess goes up again',
    }),
  },
}
