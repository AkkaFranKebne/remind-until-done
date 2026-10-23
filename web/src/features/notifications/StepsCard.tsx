import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { macBrowser, readIos, type Ios } from '../pwa/platform'

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

/** Settings → Notifications' numbered steps (decision 48). */
export function StepsCard({
  tone,
  title,
  steps,
  footer,
}: {
  tone: Tone
  title: string
  steps: ReactNode[]
  footer?: string
}) {
  return (
    <div className={stepsCard({ tone })}>
      <h3 className={stepsTitle({ tone })}>{title}</h3>
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

/** iOS 18 put every app under Settings → Apps; before that, apps were further down the list. */
export function FindRud({ ios }: { ios: Ios }) {
  const major = ios.version?.[0]
  return major === undefined || major >= 18 ? (
    <>
      Tap <strong>Apps → rud.</strong>
    </>
  ) : (
    <>
      Scroll to <strong>rud.</strong>
    </>
  )
}

/**
 * iPhone and iPad hide what a notification says on a locked phone by default (Show Previews:
 * When Unlocked): only "rud." shows. A grey card with the way to "Always" (decision 43).
 */
export function PreviewsTip() {
  const ios = readIos(navigator.userAgent, navigator.maxTouchPoints)
  if (!ios) return null
  return (
    <StepsCard
      tone="quiet"
      title="Nags say just “rud.” when locked?"
      steps={[
        <>
          Open {ios.device} <strong>Settings</strong>
        </>,
        <FindRud key="find" ios={ios} />,
        <>
          Tap <strong>Notifications → Show Previews</strong>
        </>,
        <>
          Pick <strong>Always</strong>
        </>,
      ]}
      footer="Your nags will be readable on the lock screen, and maybe you'll become more productive."
    />
  )
}

/**
 * macOS can mute the browser while the browser still says "allowed", so rud. can't see it and
 * looks On. A grey card with the way to unmute it, on a Mac only (decision 50).
 */
export function MacMutedTip() {
  const browser = macBrowser(navigator.userAgent, navigator.maxTouchPoints)
  if (!browser) return null
  return (
    <StepsCard
      tone="quiet"
      title="No nagging showing up on your Mac?"
      steps={[
        <>
          Open <strong>System Settings → Notifications</strong>
        </>,
        <>
          Open <strong>{browser}</strong>, and <strong>rud.</strong> if it&apos;s there. {browser}{' '}
          may show up twice: do each one.
        </>,
        <>
          Turn on <strong>Allow notifications</strong>
        </>,
        <>
          Pick <strong>Banners</strong> or <strong>Alerts</strong>
        </>,
      ]}
      footer={`macOS can mute ${browser} even when rud. says On.`}
    />
  )
}
