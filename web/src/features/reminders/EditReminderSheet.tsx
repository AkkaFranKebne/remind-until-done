import type { Reminder } from '../../lib/api/generated/model'
import { useUpdateReminder } from '../../lib/api/generated/reminders/reminders'
import { toLocalInputValue } from '../../lib/dates'
import type { AddReminderValues } from './addReminderForm'
import { ReminderFormSheet } from './ReminderFormSheet'
import { saveErrorText } from './saveErrorText'
import { useReminderChanged } from './useReminderChanged'

/**
 * "Adjust the trap": the sheet that edits a reminder (ReminderFormSheet + PATCH /reminders/:id).
 * It starts with the saved values; the saved time shows on the "Custom…" chip. Kept as it is,
 * the time isn't sent, so a nagging reminder keeps its cycle. A new time restarts it (the tip).
 * Design Inventory → Phone Screens → the reminder page's edit sheet ("Adjust the trap").
 */
export function EditReminderSheet({
  reminder,
  open,
  onOpenChange,
  defaultTimeOfDay,
}: {
  reminder: Reminder
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The user's morning time ("09:00") for the "Tomorrow" chip. */
  defaultTimeOfDay: string
}) {
  const changed = useReminderChanged()
  const update = useUpdateReminder({
    mutation: { onSuccess: (updated) => changed(reminder.id, updated) },
  })

  const savedAt = toLocalInputValue(new Date(reminder.dueAt))
  const saved: AddReminderValues = {
    title: reminder.title,
    note: reminder.note ?? '',
    when: 'custom',
    customAt: savedAt,
    interval: String(reminder.nagIntervalMin),
  }

  return (
    <ReminderFormSheet
      open={open}
      onOpenChange={onOpenChange}
      heading="Adjust the trap"
      submitLabel="Save changes"
      defaultTimeOfDay={defaultTimeOfDay}
      initialValues={saved}
      keepCustomAt={savedAt}
      tip="TIP: Changing the start time resets everything. We won't judge. Much."
      onSave={({ title, note, dueAt, nagIntervalMin }) =>
        update.mutateAsync({
          id: reminder.id,
          // No dueAt = the time stays (and so does the nag cycle).
          data: { title, note, nagIntervalMin, ...(dueAt ? { dueAt: dueAt.toISOString() } : {}) },
        })
      }
      saving={update.isPending}
      saveError={saveErrorText(update.error)}
      onClosed={update.reset}
    />
  )
}
