import { useParams } from '@tanstack/react-router'
import { House } from 'lucide-react'
import { AppScreen } from '../../app/AppScreen'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { useGetReminder } from '../../lib/api/generated/reminders/reminders'
import { ApiError } from '../../lib/api/mutator'
import { useMe } from '../auth/useMe'
import { ReminderDetail } from './ReminderDetail'
import { pollAfterCountdown } from './reminderState'

/**
 * /r/:id: loads one reminder (GET /reminders/:id) and shows it (ReminderDetail). A tapped
 * notification lands here too (M3). Loading shows placeholders; an unknown id (or another
 * user's) is the "doesn't exist" screen; other errors offer Try again.
 * Design Inventory → Screens → "Reminder Detail" (404), UX Copy → "404 reminder".
 */
export function ReminderPage() {
  const { id = '' } = useParams({ strict: false })
  const reminder = useGetReminder(id, {
    query: {
      refetchInterval: (query) => (query.state.data ? pollAfterCountdown(query.state.data) : false),
    },
  })
  const me = useMe()

  if (reminder.data) {
    return (
      <ReminderDetail reminder={reminder.data} defaultTimeOfDay={me?.defaultTimeOfDay ?? '09:00'} />
    )
  }

  if (reminder.error instanceof ApiError && reminder.error.status === 404) {
    return (
      <AppScreen>
        <section className="flex flex-1 flex-col items-center justify-center gap-3 px-3 text-center">
          <h1 className="text-lg font-bold text-balance">This reminder doesn&apos;t exist.</h1>
          <p className="text-sm text-balance text-fg2">Maybe it got done without you.</p>
          <ButtonLink to="/" icon={House} className="mt-2 w-full">
            Go home
          </ButtonLink>
        </section>
      </AppScreen>
    )
  }

  if (reminder.isError) {
    return (
      <AppScreen>
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-md bg-bg2 p-4 shadow-sm"
        >
          <p className="text-base text-fg">Something went wrong. Try again in a moment.</p>
          <Button variant="ghost" onClick={() => void reminder.refetch()}>
            Try again
          </Button>
        </div>
      </AppScreen>
    )
  }

  // Loading: the page's shape (title, line, countdown, stats) as placeholders.
  return (
    <AppScreen tight>
      <output aria-label="Loading the reminder" className="flex flex-col gap-3 pt-12">
        <Skeleton className="h-7 w-3/4 rounded-sm" />
        <Skeleton className="h-4 w-1/2 rounded-sm" />
        <Skeleton className="mx-auto mt-6 h-10 w-48 rounded-sm" />
        <Skeleton className="mt-4 h-14" />
      </output>
    </AppScreen>
  )
}
