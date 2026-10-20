import { Fieldset } from '@base-ui/react/fieldset'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import type { ReactNode, Ref } from 'react'
import { cn } from '../../lib/cn'

export type ChipOption<T extends string> = {
  value: T
  label: string
  /**
   * Laid over the chip and takes its taps, e.g. a transparent native date input: iPhone Safari
   * only opens its picker when the tap lands on the input itself. Keyboard focus stays on the chip.
   */
  overlay?: ReactNode
}

/**
 * Pick exactly one of a few options, shown as pills: the nag interval ("Then nag me every")
 * and the due-time quick picks ("When should we start?"). Built on Base UI's Radio Group, so
 * it's a radio group to screen readers ("1 h, radio, 3 of 7") and arrow keys move between
 * options; it only looks like chips. 44px tall, so every pill is an easy tap.
 * Design Inventory → Components → "IntervalChips · TimeChips".
 */
export function ChipGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
  onOptionClick,
  focusRef,
  error,
  className,
}: {
  /** The question above the pills, e.g. "Then nag me every". Names the group. */
  legend: string
  options: ChipOption<T>[]
  /** The picked option; null = none yet. */
  value: T | null
  onChange: (value: T) => void
  /** Every tap (or Space) on a chip, even the one already picked: e.g. "Custom…" opens the date picker. */
  onOptionClick?: (value: T) => void
  /** Gets the picked chip (or the first): a form can move focus here to show an error. */
  focusRef?: Ref<HTMLButtonElement>
  /** Shown right under the question (not under the chips, which may be cut off at the bottom). */
  error?: string
  className?: string
}) {
  const focusValue = value ?? options[0]?.value
  return (
    <Fieldset.Root
      // '' = nothing picked yet (keeps the group controlled from the start).
      render={
        <RadioGroup<T | ''>
          value={value ?? ''}
          onValueChange={(next) => {
            if (next !== '') onChange(next)
          }}
        />
      }
      className={cn('flex flex-col gap-2', className)}
    >
      <Fieldset.Legend className="text-sm font-semibold text-fg">{legend}</Fieldset.Legend>
      {error ? (
        <p role="alert" className="-mt-1 text-sm text-error-text">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <span key={option.value} className="relative inline-flex">
            <Radio.Root
              value={option.value}
              ref={option.value === focusValue ? focusRef : undefined}
              onClick={onOptionClick ? () => onOptionClick(option.value) : undefined}
              className={cn(
                'inline-flex min-h-11 cursor-pointer items-center rounded-full border-strong border-border bg-bg2 px-3.5 text-sm font-medium text-fg2',
                'transition-colors duration-(--duration-fast) motion-reduce:transition-none',
                'data-checked:border-accent data-checked:bg-accent-bg data-checked:text-accent',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              )}
            >
              {option.label}
            </Radio.Root>
            {option.overlay}
          </span>
        ))}
      </div>
    </Fieldset.Root>
  )
}
