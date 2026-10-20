import { Button as BaseButton } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Button } from '../../components/ui/Button'
import { ChipGroup, type ChipOption } from '../../components/ui/ChipGroup'
import { ConfirmSheet } from '../../components/ui/ConfirmSheet'
import { Sheet, SheetContent, SheetTitle } from '../../components/ui/Sheet'
import { TextField } from '../../components/ui/TextField'
import { farFutureHint, formatDue, fromLocalInputValue, toLocalInputValue } from '../../lib/dates'
import { useNow } from '../../lib/useNow'
import {
  addReminderSchema,
  intervalOptions,
  keepsSavedTime,
  MAX_NOTE,
  resolveDue,
  titleExamples,
  type AddReminderValues,
  type WhenChoice,
} from './addReminderForm'

/**
 * Inventory → AddReminderSheet: opens at 85% of its full height, dragged up it's full height and shows
 * the note. (55% was tried first: on an iPhone the keyboard then covered the whole sheet.)
 */
const PEEK = 0.85
const TALL = 1
const SNAP_POINTS = [PEEK, TALL]

/** What the form hands over. `dueAt` null = editing, and the time stays as it was. */
export type ReminderFormResult = {
  title: string
  note: string | null
  dueAt: Date | null
  nagIntervalMin: number
}

/**
 * The reminder form in a bottom sheet (title, note, when, how often): "Set the trap" creates
 * (AddReminderSheet), "Adjust the trap" edits (EditReminderSheet). The wrappers do the saving.
 * - Drag it up (or tap "Add a note") for the optional note.
 * - Swipe down / tap outside / Escape closes it; if anything is typed, it asks first
 *   ("Forget this one?") so a slip of the finger doesn't lose it.
 * - Same limits as the API; errors show inline, never as a toast.
 * Design Inventory → Phone Screens → "AddReminderSheet — collapsed / expanded", the reminder
 * page's edit sheet, UX Copy → Create form.
 */
/** Opens a date input's picker; where showPicker() isn't there, focusing the input does it. */
function showPickerOf(input: HTMLInputElement) {
  try {
    input.showPicker()
  } catch {
    input.focus()
  }
}

export function ReminderFormSheet({
  open,
  onOpenChange,
  heading,
  submitLabel,
  defaultTimeOfDay,
  initialValues,
  keepCustomAt,
  showExamples = false,
  tip,
  onSave,
  saving,
  saveError,
  onClosed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "Set the trap" / "Adjust the trap". */
  heading: string
  /** "Start nagging me" / "Save changes". */
  submitLabel: string
  /** The user's morning time ("09:00") for the "Tomorrow" chip. */
  defaultTimeOfDay: string
  /** What the form starts with, and goes back to when it closes. */
  initialValues: AddReminderValues
  /** Editing: the saved time (datetime-local value); left as it is, it's not checked or sent. */
  keepCustomAt?: string
  /** Rotating title examples as the placeholder (creating). */
  showExamples?: boolean
  /** A note above the button, e.g. what changing the time does. */
  tip?: string
  /** Saves; the sheet closes when the promise resolves and stays open when it fails. */
  onSave: (result: ReminderFormResult) => Promise<unknown>
  saving: boolean
  /** The save's error, in words; shown above the button. */
  saveError: string | null
  /** After closing: the wrapper clears its save state. */
  onClosed?: () => void
}) {
  const titleRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const noteRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const pickerRef = useRef<HTMLInputElement>(null)
  const [snapPoint, setSnapPoint] = useState<number | string | null>(PEEK)
  const [noteOpen, setNoteOpen] = useState(false)
  const [askDiscard, setAskDiscard] = useState(false)
  // A random example first, then the next one each time the sheet closes (never twice in a row).
  const [example, setExample] = useState(() => Math.floor(Math.random() * titleExamples.length))
  const now = useNow()

  const schema = useMemo(
    () => addReminderSchema(defaultTimeOfDay, keepCustomAt),
    [defaultTimeOfDay, keepCustomAt],
  )
  // `values`: when the saved reminder changes (after an edit), the form starts from it next time.
  // React Hook Form compares by content, so a new object with the same values changes nothing.
  const form = useForm<AddReminderValues>({ resolver: zodResolver(schema), values: initialValues })
  const { control, handleSubmit, reset, setValue, setFocus, formState } = form
  // Read while rendering: React Hook Form only tracks the form states a component reads.
  const { isDirty, isSubmitted, errors } = formState

  function closeAndReset() {
    setExample((i) => (i + 1) % titleExamples.length)
    reset(initialValues)
    onClosed?.()
    setNoteOpen(false)
    setSnapPoint(PEEK)
    setAskDiscard(false)
    onOpenChange(false)
  }

  /** Swipe, tap outside, Escape: close at once if empty, otherwise ask first. */
  function requestClose(next: boolean) {
    if (next) return onOpenChange(true)
    if (saving) return // saving: can't be cancelled
    if (isDirty) setAskDiscard(true)
    else closeAndReset()
  }

  // Something's missing: grow the sheet so the field with the error is in view (React Hook Form
  // then moves focus to it, using the ref each field hands over). The custom time has no visible
  // field, so its errors move focus to the picked "When" chip.
  const submit = handleSubmit(
    (v) => {
      const keep = keepsSavedTime(v, keepCustomAt)
      const due = keep ? null : resolveDue(v.when, v.customAt, defaultTimeOfDay)
      if (!keep && !due) return
      onSave({
        title: v.title.trim(),
        note: v.note.trim() || null,
        dueAt: due,
        nagIntervalMin: Number(v.interval),
      }).then(closeAndReset, () => {
        // Failed: the sheet stays open and the wrapper's saveError says why.
      })
    },
    (invalid) => {
      setSnapPoint(TALL)
      if (invalid.customAt && !invalid.title) setFocus('when')
    },
  )

  const when = useWatch({ control, name: 'when' })
  const customAt = useWatch({ control, name: 'customAt' })
  const noteValue = useWatch({ control, name: 'note' })
  const customDate = fromLocalInputValue(customAt)
  // Once it has text, the note stays even if the sheet is dragged back down.
  const showNote = noteOpen || snapPoint === TALL || noteValue !== ''
  const hint = when === 'custom' && customDate ? farFutureHint(customDate, now) : null

  /** "Custom…" from the keyboard (Space on the chip) opens the date-time picker (Inventory → TimeChips). */
  function openPicker() {
    if (pickerRef.current) showPickerOf(pickerRef.current)
  }

  /** A picked date selects "Custom…". Cancel or the picker's Reset (empty) keeps the previous pick. */
  function pickCustom(value: string) {
    if (value === '') return
    setValue('customAt', value, { shouldDirty: true, shouldValidate: isSubmitted })
    setValue('when', 'custom', { shouldDirty: true, shouldValidate: isSubmitted })
  }

  const timeOptions: ChipOption<WhenChoice>[] = [
    { value: 'in1h', label: 'In 1 h' },
    { value: 'tomorrow', label: `Tomorrow ${defaultTimeOfDay}` },
    { value: 'in3h', label: 'In 3 h' },
    // Once picked, the chip shows the chosen time (Inventory → TimeChips).
    {
      value: 'custom',
      label: when === 'custom' && customDate ? formatDue(customDate, now) : 'Custom…',
      // The real date-time input, transparent, over the chip: a tap lands on it, so iPhone Safari
      // opens its own picker (it ignores showPicker() on a hidden input). On a computer a click
      // on the input doesn't open the picker, so the click asks for it. Keyboard: Space on the
      // chip (openPicker). text-input (16px) stops iOS zooming in; closing puts focus on the chips.
      overlay: (
        <Input
          ref={pickerRef}
          type="datetime-local"
          aria-hidden="true"
          tabIndex={-1}
          min={toLocalInputValue(now)}
          value={customAt}
          onChange={(e) => pickCustom(e.currentTarget.value)}
          onClick={(e) => showPickerOf(e.currentTarget)}
          onBlur={(e) => {
            // Only when focus goes nowhere: a tap on another field keeps it there.
            if (!e.relatedTarget) setFocus('when')
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0 text-input"
        />
      ),
    },
  ]

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
        <SheetTitle className="px-5 pt-2 pb-2 text-lg font-bold">{heading}</SheetTitle>

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
                placeholder={showExamples ? titleExamples[example] : undefined}
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
                  // "Custom…" becomes picked only once a date is chosen (pickCustom).
                  onChange={(v) => {
                    if (v !== 'custom') field.onChange(v)
                  }}
                  onOptionClick={(v) => {
                    if (v === 'custom') openPicker()
                  }}
                  error={fieldState.error?.message ?? errors.customAt?.message}
                />
              )}
            />
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
          {/* Plain centred text, like the list's limit message (no box, no icon). */}
          {tip ? <p className="px-4 py-1 text-center text-sm text-fg2">{tip}</p> : null}
          {saveError ? (
            <p role="alert" className="text-sm text-error-text">
              {saveError}
            </p>
          ) : null}
          <Button type="submit" size="lg" loading={saving}>
            {submitLabel}
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
