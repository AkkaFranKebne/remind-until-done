import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

/** Numbered steps in a card: amber when something is wrong (blocked), grey for a tip. */
const stepsCard = cva('flex flex-col gap-2 rounded-lg px-3.5 py-3', {
  variants: { tone: { warn: 'bg-nag-low text-nag-low-fg', quiet: 'bg-bg3 text-fg2' } },
})
const stepDot = cva(
  'mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full text-xs font-bold',
  { variants: { tone: { warn: 'bg-nag-low-fg text-nag-low', quiet: 'bg-fg2 text-bg3' } } },
)
const stepsTitle = cva('text-sm font-bold', {
  variants: { tone: { warn: '', quiet: 'text-fg' } },
})

type Tone = NonNullable<VariantProps<typeof stepsCard>['tone']>

/**
 * Numbered steps in a card: how to change a setting on the device (decision 48). Used in Settings
 * → Notifications and on the login page. Design Inventory → UX Copy → "Settings and login —
 * lock-screen tip".
 */
export function StepsCard({
  tone,
  title,
  heading: Heading = 'h3',
  steps,
  footer,
}: {
  tone: Tone
  title: string
  /** h3 under Settings' section heading; h2 on a page with only a page title above it. */
  heading?: 'h2' | 'h3'
  steps: ReactNode[]
  footer?: string
}) {
  return (
    <div className={stepsCard({ tone })}>
      <Heading className={stepsTitle({ tone })}>{title}</Heading>
      <ol className="flex flex-col gap-1.5">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span aria-hidden="true" className={stepDot({ tone })}>
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      {footer ? <p className="text-sm">{footer}</p> : null}
    </div>
  )
}
