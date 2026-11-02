import { Field } from '@base-ui/react/field'
import { cva } from 'class-variance-authority'
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
  placeholder,
  className,
}: {
  ref?: Ref<HTMLInputElement & HTMLTextAreaElement>
  name: string
  label: string
  /** Shows "· optional" after the label (no brackets in copy). */
  optional?: boolean
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  /** The message to show under the field; undefined = valid. */
  error?: string
  /** Shows "41 / 200" (accent from 90% on). The limit itself is the form's rule. */
  maxLength?: number
  multiline?: boolean
  placeholder?: string
  className?: string
}) {
  const count = countCharacters(value)
  const limit =
    maxLength === undefined || count < maxLength * 0.9 ? 'ok' : count > maxLength ? 'over' : 'near'

  const control = {
    ref,
    value,
    onValueChange: (next: string) => onChange(next),
    onBlur,
    placeholder,
  }

  return (
    <Field.Root
      name={name}
      invalid={error !== undefined}
      className={cn('flex flex-col gap-1.5', className)}
    >
      <Field.Label className="text-sm font-semibold text-fg">
        {label}
        {optional ? <span className="font-normal text-fg2"> · optional</span> : null}
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
          <Field.Error match={error !== undefined} className="text-sm text-error-text">
            {error}
          </Field.Error>
          {maxLength !== undefined ? (
            <Field.Description className={counterTone({ limit })}>
              {count} / {maxLength}
            </Field.Description>
          ) : null}
        </div>
      ) : null}
    </Field.Root>
  )
}

/** The "41 / 200" counter: grey, accent from 90% on, red over the limit. */
const counterTone = cva('ml-auto shrink-0 text-xs tabular-nums', {
  variants: {
    limit: { ok: 'text-fg2', near: 'text-accent', over: 'text-error-text' },
  },
})

const controlClass = cn(
  'w-full rounded-md border-strong border-border bg-bg2 px-3.5 text-input text-fg placeholder:text-fg3',
  'transition-colors duration-(--duration-fast) motion-reduce:transition-none',
  // Invalid wins over focus: the red border stays while you fix the field.
  'focus-visible:border-accent focus-visible:outline-none data-invalid:border-error-text',
)
