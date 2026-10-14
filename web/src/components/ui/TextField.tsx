import { Field } from '@base-ui/react/field'
import type { Ref } from 'react'
import { cn } from '../../lib/cn'
import { countCharacters } from '../../lib/text'

/**
 * A labelled text input (or textarea) with its error message and an optional character
 * counter. Built on Base UI's Field: the label, the control, the error and the counter are
 * connected for screen readers. Errors show inline, never as a toast.
 * Controlled: the form (React Hook Form) owns the value and the error.
 * Design Inventory → Components → "Input — default", "Input — error", "Textarea + counter".
 */
export function TextField({
  ref,
  name,
  label,
  optional = false,
  value,
  onChange,
  onBlur,
  error,
  maxLength,
  multiline = false,
  type = 'text',
  min,
  max,
  placeholder,
  className,
}: {
  ref?: Ref<HTMLInputElement & HTMLTextAreaElement>
  name: string
  label: string
  /** Shows "(optional)" after the label. */
  optional?: boolean
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  /** The message to show under the field; undefined = valid. */
  error?: string
  /** Shows "41 / 200" (accent from 90% on). The limit itself is the form's rule. */
  maxLength?: number
  multiline?: boolean
  /** datetime-local opens the phone's own date and time picker (Inventory → TimeChips "Custom…"). */
  type?: 'text' | 'datetime-local'
  /** For datetime-local: the earliest and latest allowed value, e.g. "2026-10-14T10:00". */
  min?: string
  max?: string
  placeholder?: string
  className?: string
}) {
  const count = countCharacters(value)
  const nearLimit = maxLength !== undefined && count >= maxLength * 0.9

  const control = {
    ref,
    value,
    onValueChange: (next: string) => onChange(next),
    onBlur,
    placeholder,
    type,
    min,
    max,
  }

  return (
    <Field.Root
      name={name}
      invalid={error !== undefined}
      className={cn('flex flex-col gap-1.5', className)}
    >
      <Field.Label className="text-sm font-semibold text-fg">
        {label}
        {optional ? <span className="font-normal text-fg2"> (optional)</span> : null}
      </Field.Label>
      {multiline ? (
        <Field.Control
          {...control}
          render={<textarea rows={3} />}
          className={cn(controlClass, 'resize-none py-3')}
        />
      ) : (
        <Field.Control {...control} className={cn(controlClass, 'h-12')} />
      )}
      {error !== undefined || maxLength !== undefined ? (
        <div className="flex items-start justify-between gap-3">
          <Field.Error match={error !== undefined} className="text-sm text-accent">
            {error}
          </Field.Error>
          {maxLength !== undefined ? (
            <Field.Description
              className={cn(
                'ml-auto shrink-0 text-xs tabular-nums',
                nearLimit ? 'text-accent' : 'text-fg2',
              )}
            >
              {count} / {maxLength}
            </Field.Description>
          ) : null}
        </div>
      ) : null}
    </Field.Root>
  )
}

const controlClass = cn(
  'w-full rounded-md border-strong border-border bg-bg2 px-3.5 text-input text-fg placeholder:text-fg3',
  'transition-colors duration-(--duration-fast) motion-reduce:transition-none',
  'focus-visible:border-accent focus-visible:outline-none data-invalid:border-accent',
)
