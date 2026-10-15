import { useQueryClient } from '@tanstack/react-query'
import {
  getListRemindersQueryKey,
  useCreateReminder,
} from '../../lib/api/generated/reminders/reminders'
import { intervalOptions, type AddReminderValues } from './addReminderForm'
import { ReminderFormSheet } from './ReminderFormSheet'
import { saveErrorText } from './saveErrorText'

/**
 * "Set the trap": the sheet that creates a reminder (ReminderFormSheet + POST /reminders).
 * "In 1 h" and the user's usual interval start picked, so a title alone is enough to save.
 * Design Inventory → Phone Screens → "AddReminderSheet — collapsed / expanded".
 */
export function AddReminderSheet({
  open,
  onOpenChange,
  defaultTimeOfDay,
  defaultNagIntervalMin,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The user's morning time ("09:00") for the "Tomorrow" chip. */
  defaultTimeOfDay: string
  /** The user's usual nag interval, picked at the start if it's one of the chips. */
  defaultNagIntervalMin: number
}) {
  const queryClient = useQueryClient()
  const create = useCreateReminder({
    mutation: {
      // The list and the tiles reload with the new reminder (design doc 5.5).
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey() }),
    },
  })

  const startInterval = intervalOptions.some((o) => o.value === String(defaultNagIntervalMin))
    ? String(defaultNagIntervalMin)
    : '60'
  // "In 1 h" starts picked (Inventory → TimeChips).
  const empty: AddReminderValues = {
    title: '',
    note: '',
    when: 'in1h',
    customAt: '',
    interval: startInterval,
  }

  return (
    <ReminderFormSheet
      open={open}
      onOpenChange={onOpenChange}
      heading="Set the trap"
      submitLabel="Start nagging me"
      defaultTimeOfDay={defaultTimeOfDay}
      initialValues={empty}
      showExamples
      onSave={({ dueAt, ...rest }) =>
        // Creating always has a time: only editing can keep the saved one (dueAt null).
        dueAt
          ? create.mutateAsync({ data: { ...rest, dueAt: dueAt.toISOString() } })
          : Promise.reject(new Error('no time picked'))
      }
      saving={create.isPending}
      saveError={saveErrorText(create.error)}
      onClosed={create.reset}
    />
  )
}
