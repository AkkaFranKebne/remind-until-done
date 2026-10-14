import { useInfiniteQuery } from '@tanstack/react-query'
import { Inbox, Plus } from 'lucide-react'
import { useState } from 'react'
import { AppScreen } from '../../app/AppScreen'
import { Button } from '../../components/ui/Button'
import { Fab } from '../../components/ui/Fab'
import { SkeletonRow } from '../../components/ui/SkeletonRow'
import type { ReminderStatusKind } from '../../components/ui/status'
import { StatusTiles } from '../../components/ui/StatusTiles'
import type { Reminder } from '../../lib/api/generated/model'
import {
  getListRemindersQueryKey,
  listReminders,
  useListReminders,
} from '../../lib/api/generated/reminders/reminders'
import { useNow } from '../../lib/useNow'
import { useMe } from '../auth/useMe'
import { AddReminderSheet } from './AddReminderSheet'
import { ReminderRow } from './ReminderRow'
import { statusKind } from './reminderState'

/** The API allows 5 active (not done) reminders; at 5 the add button hides. */
export const MAX_ACTIVE = 5

/** The list screen's background follows the picked tile (Inventory → "/ — Reminders list"). */
const shell: Record<ReminderStatusKind | 'all', string> = {
  all: 'bg-(image:--grad-shell-brand)',
  waiting: 'bg-(image:--grad-shell-brand)',
  nagging: 'bg-(image:--grad-shell-nagging)',
  overdue: 'bg-(image:--grad-shell-overdue)',
  done: 'bg-(image:--grad-shell-done)',
}

/** Inventory → UX Copy → "Context line …": the state of things, in one dry sentence. */
function contextLine(active: Reminder[], hasDone: boolean): string {
  if (active.length === 0) return hasDone ? "You're all caught up." : 'Nothing nagging you yet.'
  const kinds = active.map(statusKind)
  if (kinds.every((k) => k === 'overdue')) return "Everything's overdue. Classic."
  const attention = kinds.filter((k) => k === 'nagging' || k === 'overdue').length
  if (attention === 1) return '1 thing needs your attention.'
  if (attention > 1) return `${attention} things need your attention.`
  return 'Nothing nagging you yet.'
}

/**
 * / — your reminders. The tiles are the filter (no tabs): none picked = all active reminders,
 * soonest first; Done shows finished ones, newest first. The + button opens "Set the trap"
 * and hides at 5 active. Data: TanStack Query; after a change the lists reload by themselves.
 * Design Inventory → Phone Screens → "/ — Reminders list", "/ — Empty list state", Reminders List states.
 */
export function RemindersPage() {
  const me = useMe()
  const now = useNow()
  const [picked, setPicked] = useState<ReminderStatusKind | null>(null)
  const [adding, setAdding] = useState(false)

  // Active reminders: at most 5, so one page is all of them.
  const upcoming = useListReminders({ status: 'upcoming' })
  // Are there any done ones? One is enough to know (the Done tile has no number).
  const anyDone = useListReminders({ status: 'done', limit: 1 })
  const hasDone = (anyDone.data?.items.length ?? 0) > 0
  // The done list itself: only once the Done tile is picked. Pages of 50, more on "Show more".
  const done = useInfiniteQuery({
    queryKey: [...getListRemindersQueryKey({ status: 'done' }), 'pages'],
    queryFn: ({ pageParam, signal }) =>
      listReminders({ status: 'done', ...(pageParam ? { cursor: pageParam } : {}) }, { signal }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: picked === 'done',
  })

  const active = upcoming.data?.items ?? []
  const doneItems = done.data?.pages.flatMap((p) => p.items) ?? []

  const countOf = (kind: ReminderStatusKind) => active.filter((r) => statusKind(r) === kind).length
  const counts = {
    waiting: countOf('waiting'),
    nagging: countOf('nagging'),
    overdue: countOf('overdue'),
    done: hasDone ? 1 : 0, // only "any or none": the tile shows no number
  }

  // A picked tile whose count dropped to 0 (its reminder started nagging, say) can't be tapped
  // again to clear it, so it stops filtering by itself.
  const filter = picked && counts[picked] !== 0 ? picked : null
  const shown =
    filter === 'done' ? doneItems : filter ? active.filter((r) => statusKind(r) === filter) : active
  // Still loading until we know whether there are done ones too (no flash of "nothing here").
  const loading = upcoming.isPending || (active.length === 0 && anyDone.isPending)
  const nothingAtAll = !loading && active.length === 0 && !hasDone
  const atLimit = active.length >= MAX_ACTIVE

  return (
    <AppScreen
      tone="brand"
      background={shell[filter ?? 'all']}
      // Only with data: no "Nothing nagging you yet." above a loading error.
      contextLine={upcoming.data && !loading ? contextLine(active, hasDone) : undefined}
    >
      <h1 className="sr-only">Your reminders</h1>
      <div className="flex flex-1 flex-col gap-4 pb-24">
        {/* Only when there's nothing to show: a failed background reload keeps the list. */}
        {upcoming.isError && !upcoming.data ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-md bg-bg2 p-4 shadow-sm"
          >
            <p className="text-base text-fg">Couldn&apos;t load your reminders.</p>
            <Button variant="ghost" onClick={() => void upcoming.refetch()}>
              Try again
            </Button>
          </div>
        ) : loading ? (
          // First load only: later reloads keep showing the rows they have.
          <output aria-busy="true" aria-label="Loading reminders" className="flex flex-col gap-2">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </output>
        ) : nothingAtAll ? (
          // Centred on the gradient, which stays light here in both themes (dark mode: index.css).
          <section className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-on-grad/10">
              <Inbox aria-hidden="true" size={30} strokeWidth={1.75} className="text-on-grad" />
            </span>
            <h2 className="text-lg font-bold text-balance text-on-row">
              Nothing to nag you about. Suspiciously productive.
            </h2>
            <p className="text-sm text-on-grad-fg2">Add something you&apos;ll definitely forget.</p>
          </section>
        ) : (
          <>
            <StatusTiles counts={counts} value={filter} onChange={setPicked} />

            {filter === 'done' && done.isPending ? (
              // The done list loads when its tile is picked.
              <output
                aria-busy="true"
                aria-label="Loading done reminders"
                className="flex flex-col gap-2"
              >
                <SkeletonRow />
                <SkeletonRow />
              </output>
            ) : shown.length === 0 ? (
              // On a card, like the empty state: straight on the gradient it can't be read in dark mode.
              <p className="rounded-md bg-bg2 px-4 py-3 text-center text-sm text-fg2 shadow-sm">
                {filter === 'done'
                  ? "Nothing done yet. We're not judging."
                  : 'Nothing here right now.'}
              </p>
            ) : (
              <ul
                aria-label={filter ? `${filter} reminders` : 'Active reminders'}
                className="flex flex-col"
              >
                {shown.map((r, i) => (
                  // Cards overlap like a stack (−8px); later rows paint over earlier ones.
                  <li key={r.id} className={i > 0 ? '-mt-2' : undefined}>
                    <ReminderRow reminder={r} now={now} />
                  </li>
                ))}
              </ul>
            )}

            {filter === 'done' && done.hasNextPage ? (
              <Button
                variant="ghost"
                className="self-center"
                loading={done.isFetchingNextPage}
                onClick={() => void done.fetchNextPage()}
              >
                Show more
              </Button>
            ) : null}

            {/* Always there (empty below the limit), so screen readers announce it when it fills
                in as the + button disappears (Inventory → Accessibility). */}
            <output
              className={
                atLimit ? 'block rounded-md bg-bg2 px-4 py-3 text-sm text-fg2 shadow-sm' : undefined
              }
            >
              {atLimit
                ? "You've hit 5 active reminders. Finish one before adding another. We believe in you."
                : null}
            </output>
          </>
        )}
      </div>

      {!atLimit && upcoming.data ? (
        <Fab icon={Plus} label="Add reminder" onClick={() => setAdding(true)} />
      ) : null}

      <AddReminderSheet
        open={adding}
        onOpenChange={setAdding}
        defaultTimeOfDay={me?.defaultTimeOfDay ?? '09:00'}
        defaultNagIntervalMin={me?.defaultNagIntervalMin ?? 60}
      />
    </AppScreen>
  )
}
