import { useId, type ReactNode } from 'react'
import type { Ios } from './platform'

function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-install-fg2">
      {/* The list already numbers the steps for screen readers. */}
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-solid text-xs font-bold text-on-solid"
      >
        {number}
      </span>
      <span>{children}</span>
    </li>
  )
}

/**
 * How to install on an iPhone or iPad: Safari has no install button, so we show the steps
 * (Share → Add to Home Screen). Design Inventory → Phone Screens → Login "iOS — not installed".
 */
export function IosInstallSteps({ device }: { device: Ios['device'] }) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="flex w-full max-w-sm flex-col gap-2.5 rounded-lg bg-(image:--grad-install-card) p-4 text-left"
    >
      <h2 id={titleId} className="text-base font-bold text-install-fg">
        Install on your {device} first
      </h2>
      <p className="text-sm text-install-fg">
        rud. needs to be on your Home Screen to send push notifications.
      </p>
      <ol className="flex flex-col gap-1.5">
        <Step number={1}>
          Tap the <strong>Share</strong> button in Safari
        </Step>
        <Step number={2}>
          Tap <strong>Add to Home Screen</strong>
        </Step>
        <Step number={3}>Open rud. from your Home Screen</Step>
      </ol>
    </section>
  )
}
