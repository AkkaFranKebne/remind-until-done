import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import type { Reminder, ReminderList, User } from '../../lib/api/generated/model'
import { getListRemindersQueryKey } from '../../lib/api/generated/reminders/reminders'
import { getGetMeQueryKey } from '../../lib/api/generated/user/user'
import { WithRouter } from '../../test-utils/withRouter'
import { AuthContext, type AuthContextValue } from '../auth/useAuth'
import { RemindersPage } from './RemindersPage'

const me: User = {
  id: 'u1',
  email: 'tester@example.com',
  timezone: 'Europe/Stockholm',
  defaultTimeOfDay: '09:00',
  defaultNagIntervalMin: 60,
}
const user = { email: me.email, name: 'Tess' }
const auth: AuthContextValue = {
  state: { status: 'signedIn', user },
  user,
  signIn: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  accountDeleted: () => Promise.resolve(),
}

const hour = 3_600_000
function reminder(id: string, title: string, over: Partial<Reminder>): Reminder {
  return {
    id,
    title,
    dueAt: new Date(Date.now() + 20 * hour).toISOString(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nagIntervalMin: 60,
    nagCount: 0,
    nagsExhausted: false,
    ...over,
  }
}

const active = [
  reminder('1', 'Book a plumber', {}),
  reminder('2', 'Call dentist', { status: 'sent', nagCount: 2 }),
  reminder('3', 'Reply to landlord', { status: 'sent', nagCount: 5 }),
  reminder('4', 'Renew passport', { status: 'sent', nagCount: 12, nagsExhausted: true }),
]
const done = [
  reminder('5', 'Buy birthday card', {
    status: 'done',
    doneAt: new Date(Date.now() - 5 * 24 * hour).toISOString(),
  }),
]

/**
 * The page with its data already in the cache, so no network is needed: signed in, and the
 * lists answer as given. `loading` leaves the active list empty, so it shows the skeleton.
 */
function Seeded({
  upcoming,
  doneList,
  loading = false,
  children,
}: {
  upcoming: Reminder[]
  doneList: Reminder[]
  loading?: boolean
  children: ReactNode
}) {
  const [client] = useState(() => {
    const c = new QueryClient({
      defaultOptions: {
        queries: { staleTime: Infinity, retry: false, queryFn: () => new Promise(() => {}) },
      },
    })
    c.setQueryData(getGetMeQueryKey(), me)
    if (!loading)
      c.setQueryData<ReminderList>(getListRemindersQueryKey({ status: 'upcoming' }), {
        items: upcoming,
        nextCursor: null,
      })
    // "Any done?" (1 is enough), and the done list for when the Done tile is tapped.
    c.setQueryData<ReminderList>(getListRemindersQueryKey({ status: 'done', limit: 1 }), {
      items: doneList.slice(0, 1),
      nextCursor: null,
    })
    c.setQueryData([...getListRemindersQueryKey({ status: 'done' }), 'pages'], {
      pages: [{ items: doneList, nextCursor: null }],
      pageParams: [''],
    })
    return c
  })
  return (
    <QueryClientProvider client={client}>
      <AuthContext value={auth}>{children}</AuthContext>
    </QueryClientProvider>
  )
}

const meta = {
  title: 'Reminders/RemindersPage',
  component: RemindersPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof RemindersPage>

export default meta
type Story = StoryObj<typeof meta>

const page = (props: { upcoming: Reminder[]; doneList: Reminder[]; loading?: boolean }) => (
  <WithRouter>
    <Seeded {...props}>
      <RemindersPage />
    </Seeded>
  </WithRouter>
)

/** No tile picked: all active reminders, overdue, then nagging, then waiting. Tap a tile to filter. */
export const List: Story = { render: () => page({ upcoming: active, doneList: done }) }

/** No reminders at all: the warm empty state, no tiles. */
export const Empty: Story = { render: () => page({ upcoming: [], doneList: [] }) }

/** Nothing active, only done ones: the tiles stay, with the same empty state under them. */
export const OnlyDone: Story = { render: () => page({ upcoming: [], doneList: done }) }

/** Story only: while it's shown, API calls never answer, so the page stays in its first load. */
function NeverAnswer({ children }: { children: ReactNode }) {
  useState(() => {
    window.fetch = () => new Promise<Response>(() => {})
    return null
  })
  useEffect(() => () => {
    window.fetch = realFetch
  })
  return children
}
const realFetch = window.fetch.bind(window)

/** First load: three shimmering rows. */
export const Loading: Story = {
  render: () => <NeverAnswer>{page({ upcoming: [], doneList: [], loading: true })}</NeverAnswer>,
}

/** 5 active: the + button is hidden and a note says why. */
export const LimitReached: Story = {
  render: () =>
    page({
      upcoming: [...active, reminder('6', 'Water the plants', {})],
      doneList: done,
    }),
}
