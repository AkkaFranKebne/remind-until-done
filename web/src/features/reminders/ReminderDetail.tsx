import { useNavigate } from '@tanstack/react-router'
import { cva } from 'class-variance-authority'
import { Check, ChevronLeft, Pencil, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { AppScreen } from '../../app/AppScreen'
import { Button } from '../../components/ui/Button'
import { ConfirmSheet } from '../../components/ui/ConfirmSheet'
import { IconButton, IconLink } from '../../components/ui/IconButton'
import { useToast } from '../../components/ui/useToast'
import type { Reminder } from '../../lib/api/generated/model'
import { useDeleteReminder, useMarkReminderDone } from '../../lib/api/generated/reminders/reminders'
import { cn } from '../../lib/cn'
import { formatTook } from '../../lib/dates'
import { useNow } from '../../lib/useNow'
import { EditReminderSheet } from './EditReminderSheet'
import {
  intervalLabel,
  MAX_PUSHES,
  pageCountdown,
  pageSubLine,
  rowLevel,
  type RowLevel,
} from './reminderState'
import { toastText } from './toastText'
import { useListSearch } from './useListSearch'
import { useReminderChanged } from './useReminderChanged'

/** Each state's gradient (index.css: strong top in light, dark tint in dark). */
const background = {
  waiting: 'bg-(image:--grad-detail-waiting)',
  'nag-low': 'bg-(image:--grad-detail-nag-low)',
  'nag-mid': 'bg-(image:--grad-detail-nag-mid)',
  'nag-high': 'bg-(image:--grad-detail-nag-high)',
  overdue: 'bg-(image:--grad-detail-overdue)',
  done: 'bg-(image:--grad-detail-done)',
} satisfies Record<RowLevel, string>

/** One text colour per state: title, line, countdown, icons (the TopBar tone uses the same). */
const stateText = {
  waiting: 'text-on-grad',
  'nag-low': 'text-nag-low-fg',
  'nag-mid': 'text-nag-mid-fg',
  'nag-high': 'text-tile-overdue-fg',
  overdue: 'text-tile-overdue-fg',
  done: 'text-tag-done-fg',
} satisfies Record<RowLevel, string>

const label = 'text-xs font-semibold tracking-wider text-on-grad-fg2 uppercase'

/**
 * The funny line at the bottom, above the button: big, and it comes in when the page opens. From
 * push 4 (and overdue) it also wiggles a few times, to draw the eye (Inventory → Motion "Funny
 * line"). Reduced motion: it just shows.
 */
const funnyLine = cva(
  'mb-2 text-center text-xl font-bold text-balance motion-reduce:animate-none',
  {
    variants: {
      level: {
        waiting: 'animate-line-in',
        'nag-low': 'animate-line-in',
        'nag-mid': 'animate-line-in-nudge',
        'nag-high': 'animate-line-in-nudge',
        overdue: 'animate-line-in-nudge',
        done: 'animate-line-in',
      } satisfies Record<RowLevel, string>,
    },
  },
)

/**
 * The big countdown. While a push is due ("Starting now", 00:00) it pulses until the push
 * arrives and the page moves on (Inventory → Motion "Countdown pulse"); reduced motion: still.
 */
const countdownValue = cva('text-countdown font-bold tracking-wide tabular-nums', {
  variants: {
    pulse: { true: 'animate-count-pulse motion-reduce:animate-none', false: '' },
  },
})

/**
 * The reminder page (/r/:id) for a loaded reminder: its title and note on the state's gradient,
 * a countdown, how often it nags, the funny line, and the actions: Done (the main one; once done,
 * a Delete button instead), edit ("Adjust the trap"), delete (asks first). No "Remind later"
 * here: that's only on the Android notification.
 * Design Inventory → Phone Screens → "ReminderPage /r/:id" (mockup approved 2026-10-15).
 */
export function ReminderDetail({
  reminder,
  defaultTimeOfDay,
}: {
  reminder: Reminder
  /** The user's morning time, for the edit sheet's "Tomorrow" chip. */
  defaultTimeOfDay: string
}) {
  const navigate = useNavigate()
  const listSearch = useListSearch()
  const changed = useReminderChanged()
  const toast = useToast()
  const level = rowLevel(reminder)
  const done = level === 'done'
  // Nagging counts down to the second; the other states change by the minute.
  const now = useNow(level.startsWith('nag-') ? 1000 : 60_000)
  const [editing, setEditing] = useState(false)
  const [askDelete, setAskDelete] = useState(false)

  const markDone = useMarkReminderDone({
    mutation: { onSuccess: (updated) => changed(reminder.id, updated) },
  })
  const remove = useDeleteReminder({
    mutation: {
      onSuccess: async () => {
        // Same as a swipe-delete on the list: back there (the same tile), with the toast.
        toast.success(toastText.deleted)
        await navigate({ to: '/', search: listSearch })
        await changed(reminder.id)
      },
      onError: () => setAskDelete(false),
    },
  })
  const failed = markDone.isError || remove.isError

  const countdown = pageCountdown(reminder, now)
  const line = pageSubLine(reminder)
  const count = (
    <>
      {reminder.nagCount}{' '}
      <span className="text-sm font-normal text-on-grad-fg2">/ {MAX_PUSHES}</span>
    </>
  )
  const stats: { term: string; value: ReactNode }[] = done
    ? [
        { term: 'Nagged', value: count },
        {
          term: 'Took',
          value: formatTook(
            Date.parse(reminder.doneAt ?? reminder.updatedAt) - Date.parse(reminder.dueAt),
          ),
        },
      ]
    : [
        { term: 'Nagging every', value: intervalLabel(reminder.nagIntervalMin) },
        { term: 'Times bothered', value: count },
      ]

  return (
    <AppScreen tone={level} background={background[level]} tight>
      <div className={cn('flex flex-1 flex-col', stateText[level])}>
        {/* Back lines up with the title; Edit and Delete end where the TopBar's Settings
            icon ends, so the right-hand icons sit in one column. */}
        <div className="-mr-1.5 -ml-3.5 flex items-center">
          <IconLink
            to="/"
            search={listSearch}
            icon={ChevronLeft}
            size="sm"
            label="Back"
            className="text-current"
          />
          <span className="flex-1" />
          <IconButton
            icon={Pencil}
            label="Edit"
            className="text-current"
            onClick={() => setEditing(true)}
          />
          <IconButton
            icon={Trash2}
            label="Delete"
            className="text-current"
            onClick={() => setAskDelete(true)}
          />
        </div>

        <h1
          className={cn(
            'mt-2 text-title font-bold text-balance break-words',
            done && 'line-through decoration-current/40',
          )}
        >
          {reminder.title}
        </h1>
        {reminder.note ? (
          // The note, as typed (line breaks kept), in the title's colour: the line under the
          // title used to be the funny line, which now sits at the bottom (2026-10-26).
          <p className="mt-1.5 text-base break-words whitespace-pre-line">{reminder.note}</p>
        ) : null}

        <div className="mt-6 flex flex-col items-center gap-2 border-b border-current/20 pb-4">
          <p className={label}>{countdown ? countdown.label : 'Completed'}</p>
          {done ? (
            <Check aria-hidden="true" size={48} strokeWidth={1.75} />
          ) : countdown ? (
            <p className={countdownValue({ pulse: countdown.due })}>{countdown.value}</p>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 py-3">
          {stats.map(({ term, value }, i) => (
            <div
              key={term}
              className={cn(
                'flex flex-col gap-1 pr-3',
                i === 0 ? 'border-r border-current/20' : 'pl-4',
              )}
            >
              <dt className={label}>{term}</dt>
              <dd className="text-xl font-bold text-fg">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-auto flex flex-col gap-2 pt-4">
          {/* key: a new line (M5: one per push) plays the entrance again. */}
          <p key={line} className={funnyLine({ level })}>
            {done ? (
              <Check
                aria-hidden="true"
                size={20}
                strokeWidth={2.5}
                className="mr-1.5 inline align-middle"
              />
            ) : null}
            {line}
          </p>
          {failed ? (
            <p role="alert" className="text-sm text-error-text">
              Something went wrong. Try again in a moment.
            </p>
          ) : null}
          {done ? (
            // A done reminder stays done (editing its time makes it active again), so its one
            // action is Delete: the same confirm sheet as the trash icon. A calm card-coloured
            // button, not red: red is for the final "Delete" in the sheet (2026-10-26).
            <Button size="lg" variant="surface" icon={Trash2} onClick={() => setAskDelete(true)}>
              Delete
            </Button>
          ) : (
            <Button
              size="lg"
              icon={Check}
              loading={markDone.isPending}
              onClick={() => markDone.mutate({ id: reminder.id })}
            >
              Done
            </Button>
          )}
        </div>
      </div>

      <EditReminderSheet
        reminder={reminder}
        open={editing}
        onOpenChange={setEditing}
        defaultTimeOfDay={defaultTimeOfDay}
      />
      <ConfirmSheet
        open={askDelete}
        onOpenChange={setAskDelete}
        icon={Trash2}
        title="Delete this reminder?"
        confirmLabel="Delete"
        cancelLabel="Keep it"
        danger
        confirming={remove.isPending}
        onConfirm={() => remove.mutate({ id: reminder.id })}
      >
        We&apos;ll stop nagging. Just this once.
      </ConfirmSheet>
    </AppScreen>
  )
}
