import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronLeft, CircleCheck, Pencil, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { AppScreen } from '../../app/AppScreen'
import { Button } from '../../components/ui/Button'
import { ConfirmSheet } from '../../components/ui/ConfirmSheet'
import { IconButton, IconLink } from '../../components/ui/IconButton'
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
 * The reminder page (/r/:id) for a loaded reminder: its state on the state's gradient, a
 * countdown, how often it nags, and the actions: Done (the main one), edit ("Adjust the trap"),
 * delete (asks first). No "Remind later" here: that's only on the Android notification.
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
  const changed = useReminderChanged()
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
        await navigate({ to: '/' })
        await changed(reminder.id)
      },
      onError: () => setAskDelete(false),
    },
  })
  const failed = markDone.isError || remove.isError

  const countdown = pageCountdown(reminder, now)
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
        <div className="-mx-3.5 flex items-center">
          <IconLink to="/" icon={ChevronLeft} size="sm" label="Back" className="text-current" />
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
            'mt-2 text-xl font-bold text-balance break-words',
            done && 'line-through decoration-current/40',
          )}
        >
          {reminder.title}
        </h1>
        <p className="mt-1.5 flex items-start gap-1.5 text-sm">
          {done ? (
            <Check aria-hidden="true" size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
          ) : null}
          {pageSubLine(reminder)}
        </p>

        <div className="mt-6 flex flex-col items-center gap-2 border-b border-current/20 pb-4">
          <p className={label}>{countdown ? countdown.label : 'Completed'}</p>
          {done ? (
            <Check aria-hidden="true" size={48} strokeWidth={1.75} />
          ) : countdown?.value ? (
            <p className="text-countdown font-bold tracking-wide tabular-nums">{countdown.value}</p>
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
          {failed ? (
            <p role="alert" className="text-sm text-error-text">
              Something went wrong. Try again in a moment.
            </p>
          ) : null}
          {done ? (
            // Not a button: a done reminder stays done (editing its time makes it active again).
            <p className="flex h-13 items-center justify-center gap-2 rounded-md border-strong border-done-pill-ring bg-chip-on-done-row text-base font-bold text-tag-done-fg">
              <CircleCheck aria-hidden="true" size={20} strokeWidth={2} />
              Done
            </p>
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
