import { Button as BaseButton } from '@base-ui/react/button'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Button } from '../../components/ui/Button'
import { ChipGroup, type ChipOption } from '../../components/ui/ChipGroup'
import { ConfirmSheet } from '../../components/ui/ConfirmSheet'
import { Sheet, SheetContent, SheetTitle } from '../../components/ui/Sheet'
import { TextField } from '../../components/ui/TextField'
import {
  getListRemindersQueryKey,
  useCreateReminder,
} from '../../lib/api/generated/reminders/reminders'
import { ApiError } from '../../lib/api/mutator'
import { farFutureHint, formatDue, fromLocalInputValue, toLocalInputValue } from '../../lib/dates'
import { useNow } from '../../lib/useNow'
import {
  addReminderSchema,
  intervalOptions,
  MAX_NOTE,
  resolveDue,
  titleExamples,
  type AddReminderValues,
  type WhenChoice,
} from './addReminderForm'

/** Inventory → AddReminderSheet: peeks at 55% of the screen, dragged up it's 85% and shows the note. */
const PEEK = 0.55
const TALL = 0.85
const SNAP_POINTS = [PEEK, TALL]

/**
 * "Set the trap": the bottom sheet that creates a reminder (title, when, how often).
 * - Drag it up (or tap "Add a note") for the optional note.
 * - Swipe down / tap outside / Escape closes it; if anything is typed, it asks first
 *   ("Forget this one?") so a slip of the finger doesn't lose it.
 * - Same limits as the API; errors show inline, never as a toast.
 * Design Inventory → Phone Screens → "AddReminderSheet — collapsed / expanded", UX Copy → Create form.
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
  const titleRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const noteRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const [snapPoint, setSnapPoint] = useState<number | string | null>(PEEK)
  const [noteOpen, setNoteOpen] = useState(false)
  const [askDiscard, setAskDiscard] = useState(false)
  // A random example first, then the next one each time the sheet closes (never twice in a row).
  const [example, setExample] = useState(() => Math.floor(Math.random() * titleExamples.length))
  const now = useNow()

  const startInterval = intervalOptions.some((o) => o.value === String(defaultNagIntervalMin))
    ? String(defaultNagIntervalMin)
    : '60'
  // "In 1 h" starts picked (Inventory → TimeChips), so a title alone is enough to save.
  const empty: AddReminderValues = {
    title: '',
    note: '',
    when: 'in1h',
    customAt: '',
    interval: startInterval,
  }
  const schema = useMemo(() => addReminderSchema(defaultTimeOfDay), [defaultTimeOfDay])
  const form = useForm<AddReminderValues>({ resolver: zodResolver(schema), defaultValues: empty })
  const { control, handleSubmit, reset, formState } = form
  // Read while rendering: React Hook Form only tracks the form states a component reads.
  const { isDirty } = formState

  const create = useCreateReminder({
    mutation: {
      onSuccess: async () => {
        // The list and the tiles reload with the new reminder (design doc 5.5).
        await queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey() })
        closeAndReset()
      },
    },
  })

  function closeAndReset() {
    setExample((i) => (i + 1) % titleExamples.length)
    reset(empty)
    create.reset()
    setNoteOpen(false)
    setSnapPoint(PEEK)
    setAskDiscard(false)
    onOpenChange(false)
  }

  /** Swipe, tap outside, Escape: close at once if empty, otherwise ask first. */
  function requestClose(next: boolean) {
    if (next) return onOpenChange(true)
    if (create.isPending) return // saving: can't be cancelled
    if (isDirty) setAskDiscard(true)
    else closeAndReset()
  }

  // Something's missing: grow the sheet so the field with the error is in view (React Hook Form
  // then moves focus to it, using the ref each field hands over).
  const submit = handleSubmit(
    (v) => {
      const due = resolveDue(v.when, v.customAt, defaultTimeOfDay)
      if (!due) return
      create.mutate({
        data: {
          title: v.title.trim(),
          note: v.note.trim() || null,
          dueAt: due.toISOString(),
          nagIntervalMin: Number(v.interval),
        },
      })
    },
    () => setSnapPoint(TALL),
  )

  const when = useWatch({ control, name: 'when' })
  const customAt = useWatch({ control, name: 'customAt' })
  const noteValue = useWatch({ control, name: 'note' })
  const customDate = fromLocalInputValue(customAt)
  const timeOptions: ChipOption<WhenChoice>[] = [
    { value: 'in1h', label: 'In 1 h' },
    { value: 'tomorrow', label: `Tomorrow ${defaultTimeOfDay}` },
    { value: 'in3h', label: 'In 3 h' },
    // Once picked, the chip shows the chosen time (Inventory → TimeChips).
    {
      value: 'custom',
      label: when === 'custom' && customDate ? formatDue(customDate, now) : 'Custom…',
    },
  ]
  // Once it has text, the note stays even if the sheet is dragged back down.
  const showNote = noteOpen || snapPoint === TALL || noteValue !== ''
  const hint = when === 'custom' && customDate ? farFutureHint(customDate, now) : null

  const saveError =
    create.error instanceof ApiError && create.error.code === 'limit_reached'
      ? "You've hit 5 active reminders. Finish one before adding another. We believe in you."
      : create.error
        ? "Couldn't save. Try again."
        : null

  function openNote() {
    setNoteOpen(true)
    setSnapPoint(TALL)
    // After the field is drawn: put the cursor in it.
    requestAnimationFrame(() => noteRef.current?.focus())
  }

  return (
    <Sheet
      open={open}
      onOpenChange={requestClose}
      layout="full"
      snapPoints={SNAP_POINTS}
      snapPoint={snapPoint}
      onSnapPointChange={setSnapPoint}
      initialFocus={titleRef}
    >
      <form noValidate onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col">
        <SheetTitle className="px-5 pt-2 pb-2 text-lg font-bold">Set the trap</SheetTitle>

        <SheetContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-1 pb-4">
          <Controller
            name="title"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                ref={(el) => {
                  field.ref(el)
                  titleRef.current = el
                }}
                name={field.name}
                label="What are you forgetting?"
                placeholder={titleExamples[example]}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />

          {showNote ? (
            <Controller
              name="note"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  ref={(el) => {
                    field.ref(el)
                    noteRef.current = el
                  }}
                  name={field.name}
                  label="Note"
                  optional
                  multiline
                  maxLength={MAX_NOTE}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
          ) : (
            // Dragging up shows the note too; this is the way for keyboards and screen readers.
            <BaseButton
              onClick={openNote}
              className="-my-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-sm text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Plus aria-hidden="true" size={16} strokeWidth={2} />
              Add a note
            </BaseButton>
          )}

          <div className="flex flex-col gap-2">
            <Controller
              name="when"
              control={control}
              render={({ field, fieldState }) => (
                <ChipGroup
                  focusRef={field.ref}
                  legend="When should we start?"
                  options={timeOptions}
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
            {when === 'custom' ? (
              <Controller
                name="customAt"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    ref={field.ref}
                    name={field.name}
                    label="Pick a date and time"
                    type="datetime-local"
                    min={toLocalInputValue(now)}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                  />
                )}
              />
            ) : null}
            {hint ? <p className="text-sm text-fg2">{hint}</p> : null}
          </div>

          <Controller
            name="interval"
            control={control}
            render={({ field }) => (
              <ChipGroup
                legend="Then nag me every"
                options={intervalOptions}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SheetContent>

        {/* The CTA stays at the bottom in both sheet heights (sheet-tall's padding). */}
        <div className="flex flex-col gap-2 border-t border-border px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {saveError ? (
            <p role="alert" className="text-sm text-error-text">
              {saveError}
            </p>
          ) : null}
          <Button type="submit" size="lg" loading={create.isPending}>
            Start nagging me
          </Button>
        </div>
      </form>

      <ConfirmSheet
        open={askDiscard}
        onOpenChange={setAskDiscard}
        icon={Trash2}
        title="Forget this one?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        danger
        onConfirm={closeAndReset}
      >
        You&apos;ll lose what you typed. Ironic, for a reminder app.
      </ConfirmSheet>
    </Sheet>
  )
}
