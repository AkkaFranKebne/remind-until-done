import { useParams } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { AppScreen } from '../../app/AppScreen'
import { Button, ButtonLink } from '../../components/ui/Button'
import { CenteredScreen } from '../../components/ui/CenteredScreen'
import { IconLink } from '../../components/ui/IconButton'
import { TopBar } from '../../components/ui/TopBar'
import { Skeleton } from '../../components/ui/Skeleton'
import { useGetReminder } from '../../lib/api/generated/reminders/reminders'
import { ApiError } from '../../lib/api/mutator'
import { useMe } from '../auth/useMe'
import { ReminderDetail } from './ReminderDetail'
import { pollAfterCountdown } from './reminderState'
import { useListSearch } from './useListSearch'
import { errorText } from '../../lib/api/errorText'

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
  const listSearch = useListSearch()

  if (reminder.data) {
    return (
      <ReminderDetail reminder={reminder.data} defaultTimeOfDay={me?.defaultTimeOfDay ?? '09:00'} />
    )
  }

  if (reminder.error instanceof ApiError && reminder.error.status === 404) {
    // Inventory → Phone Screens → "/r/:id 404": the Global 404's look, plus ‹ Back under the
    // logo and no Settings icon.
    return (
      <CenteredScreen
        header={
          <>
            <TopBar showSettings={false} />
            <div className="px-4">
              <IconLink
                to="/"
                search={listSearch}
                icon={ChevronLeft}
                size="sm"
                label="Back"
                className="-ml-3.5 text-accent"
              />
            </div>
          </>
        }
        className="gap-3.5 px-7"
      >
        <p aria-hidden="true" className="text-display font-bold tracking-tighter text-accent-bg">
          404
        </p>
        <h1 className="mt-1 text-lg font-bold text-balance">This reminder doesn&apos;t exist.</h1>
        <p className="text-sm text-fg2">
          Maybe it got done without you.
          <br />
          Or it never existed. Who knows.
        </p>
        <ButtonLink to="/" search={listSearch} icon={ChevronLeft} className="mt-4 w-full">
          Back to list
        </ButtonLink>
      </CenteredScreen>
    )
  }

  if (reminder.isError) {
    return (
      <AppScreen>
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-md bg-bg2 p-4 shadow-sm"
        >
          <p className="text-base text-fg">
            {errorText(reminder.error, 'Something went wrong. Try again in a moment.')}
          </p>
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
