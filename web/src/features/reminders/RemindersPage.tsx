import { useInfiniteQuery, useMutationState } from '@tanstack/react-query'
import { Inbox, List, Plus } from 'lucide-react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { AppScreen } from '../../app/AppScreen'
import { Button } from '../../components/ui/Button'
import { Fab } from '../../components/ui/Fab'
import { Skeleton } from '../../components/ui/Skeleton'
import { statusIcon, statusLabel, type ReminderStatusKind } from '../../components/ui/status'
import { StatusTiles } from '../../components/ui/StatusTiles'
import { useToast } from '../../components/ui/useToast'
import {
  getDeleteReminderMutationKey,
  getListRemindersQueryKey,
  getMarkReminderDoneMutationKey,
  listReminders,
  useDeleteReminder,
  useListReminders,
  useMarkReminderDone,
} from '../../lib/api/generated/reminders/reminders'
import { useNow } from '../../lib/useNow'
import { cn } from '../../lib/cn'
import { useMe } from '../auth/useMe'
import { NotifBanner } from '../notifications/NotifBanner'
import { InstallBanner } from '../pwa/InstallBanner'
import { AddReminderSheet } from './AddReminderSheet'
import { ReminderRow } from './ReminderRow'
import { SwipeableRow } from './SwipeableRow'
import { toastText } from './toastText'
import { statusKind } from './reminderState'
import { useReminderChanged } from './useReminderChanged'

/** The reminder ids of the still-running mutations with this key (their `{ id }` input). */
function usePendingIds(mutationKey: readonly unknown[]): string[] {
  return useMutationState({
    filters: { mutationKey, status: 'pending' },
    select: (m) => {
      const input = m.state.variables
      return typeof input === 'object' && input !== null && 'id' in input ? String(input.id) : ''
    },
  })
}

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

/**
 * / — your reminders. The tiles are the filter (no tabs): none picked = all active reminders,
 * soonest first; Done shows finished ones, newest first. The + button opens "Set the trap"
 * and hides at 5 active. Data: TanStack Query; after a change the lists reload by themselves.
 * Design Inventory → Phone Screens → "/ — Reminders list", "/ — Empty list state", Reminders List states.
 */
export function RemindersPage() {
  const me = useMe()
  const now = useNow()
  // The picked tile is in the address (/?show=done), so Back from a reminder and a reload keep it.
  // Replace, not push: switching tiles doesn't fill the Back history.
  // (strict: false: also works in Storybook's small router, where there's no /app/ route.)
  const picked = useSearch({ strict: false }).show ?? null
  const navigate = useNavigate({ from: '/' })
  const setPicked = (kind: ReminderStatusKind | null) =>
    void navigate({ search: kind ? { show: kind } : {}, replace: true, resetScroll: false })
  const [adding, setAdding] = useState(false)
  const changed = useReminderChanged()
  const toast = useToast()
  // Returning the reload from onSuccess keeps the mutation pending until the lists have it, so
  // a swiped row doesn't flash back in between (TanStack awaits onSuccess before "success").
  const markDone = useMarkReminderDone({
    mutation: {
      onSuccess: (updated, { id }) => {
        toast.success(toastText.done)
        return changed(id, updated)
      },
      onError: () => toast.error(toastText.failed),
    },
  })
  const remove = useDeleteReminder({
    mutation: {
      onSuccess: (_data, { id }) => {
        toast.success(toastText.deleted)
        return changed(id)
      },
      onError: () => toast.error(toastText.failed),
    },
  })
  // Optimistic, "via the UI" (TanStack Query docs): a row whose Done or Delete is still running
  // is hidden. A failed one is no longer pending, so its row comes back by itself.
  const leaving = new Set([
    ...usePendingIds(getMarkReminderDoneMutationKey()),
    ...usePendingIds(getDeleteReminderMutationKey()),
  ])

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

  const active = (upcoming.data?.items ?? []).filter((r) => !leaving.has(r.id))
  const doneItems = (done.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (r) => !leaving.has(r.id),
  )

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
  // Only after a successful load: a failed one is not "no reminders".
  const nothingAtAll = !loading && upcoming.isSuccess && active.length === 0 && !hasDone
  const atLimit = active.length >= MAX_ACTIVE

  return (
    <AppScreen
      tone="brand"
      background={shell[filter ?? 'all']}
      // Only on the empty state (Inventory): with reminders, the tiles start right under the bar.
      contextLine={nothingAtAll ? 'Nothing nagging you yet.' : undefined}
      tight={!nothingAtAll}
    >
      <h1 className="sr-only">Your reminders</h1>
      <div className="flex flex-1 flex-col gap-4 pb-24">
        {/* One at a time: InstallBanner only in a tab, NotifBanner only in the installed app. */}
        <InstallBanner />
        <NotifBanner />
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
          <output aria-busy="true" aria-label="Loading reminders" className="flex flex-col gap-4">
            {/* The same layout as the loaded list: tiles, the label line, a stack of rows. */}
            <span className="grid grid-cols-2 gap-2">
              <Skeleton className="h-22.5" />
              <Skeleton className="h-22.5" />
              <Skeleton className="h-22.5" />
              <Skeleton className="h-22.5" />
            </span>
            <Skeleton className="h-3 w-32 rounded-sm" />
            <span className="flex flex-col">
              <Skeleton className="shadow-row-1" />
              <Skeleton className="-mt-2 shadow-row-2" />
              <Skeleton className="-mt-2 shadow-row-3" />
            </span>
          </output>
        ) : nothingAtAll ? (
          // Centred on the list gradient (light, or a dark violet in dark mode: index.css).
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
            <ListLabel filter={filter} />

            {filter === 'done' && done.isPending ? (
              // The done list loads when its tile is picked.
              <output
                aria-busy="true"
                aria-label="Loading done reminders"
                className="flex flex-col"
              >
                <Skeleton className="shadow-row-1" />
                <Skeleton className="-mt-2 shadow-row-2" />
              </output>
            ) : shown.length === 0 ? (
              // A small card under the tiles: "nothing here" for the picked filter.
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
                    {/* Every row swipes left to delete; done ones have nothing to swipe right to. */}
                    <SwipeableRow
                      onDone={filter === 'done' ? undefined : () => markDone.mutate({ id: r.id })}
                      onDelete={() => remove.mutate({ id: r.id })}
                    >
                      <ReminderRow reminder={r} now={now} position={i + 1} />
                    </SwipeableRow>
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
              // As the Inventory: plain centred text under the rows, in both themes.
              className={atLimit ? 'block px-4 py-3 text-center text-sm text-fg2' : undefined}
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

const labelTone: Record<ReminderStatusKind | 'all', string> = {
  all: 'text-on-grad-fg2',
  waiting: 'text-on-grad',
  nagging: 'text-on-grad-fg2',
  overdue: 'text-tile-overdue-fg',
  done: 'text-tag-done-fg',
}

/** The small uppercase name of what the list shows (Inventory → "/ — Reminders list"). */
function ListLabel({ filter }: { filter: ReminderStatusKind | null }) {
  const Icon = filter ? statusIcon[filter] : List
  return (
    <p
      className={cn(
        '-mb-2 flex items-center gap-1.5 px-0.5 text-xs font-bold tracking-widest uppercase',
        labelTone[filter ?? 'all'],
      )}
    >
      <Icon aria-hidden="true" size={12} strokeWidth={2.5} />
      {filter ? statusLabel[filter] : 'The full chaos'}
    </p>
  )
}
