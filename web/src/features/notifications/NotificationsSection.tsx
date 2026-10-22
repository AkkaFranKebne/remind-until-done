import { cva, type VariantProps } from 'class-variance-authority'
import { Bell } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/useToast'
import { readIos } from '../pwa/platform'
import { TabInstallHint } from '../pwa/TabInstallHint'
import { useNotifications, type NotificationState } from './useNotifications'

/**
 * The bell's tile: green when on, red when blocked, amber when pushes go nowhere or elsewhere.
 * Status tokens with dark values (the mockup's --tag-pending and --error-bg have none).
 */
const bellTile = cva('flex size-8.5 shrink-0 items-center justify-center rounded-md', {
  variants: {
    look: {
      on: 'bg-tag-done text-tag-done-fg',
      blocked: 'bg-tag-nagging text-tag-nagging-fg',
      warn: 'bg-nag-low text-nag-low-fg',
      plain: 'bg-bg3 text-fg2',
    },
  },
})

const badge = cva('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', {
  variants: {
    on: { true: 'bg-tag-done text-tag-done-fg', false: 'bg-tag-nagging text-tag-nagging-fg' },
  },
})

type Look = NonNullable<VariantProps<typeof bellTile>['look']>

/** The row for each state (Design Inventory → Phone Screens → Settings; decision 43). */
const rows: Record<
  Exclude<NotificationState, 'blocked'>,
  { sub: string; look: Look; on?: boolean }
> = {
  'needs-install': { sub: 'Needs the installed app', look: 'plain', on: false },
  unsupported: { sub: 'Not supported in this browser', look: 'plain', on: false },
  checking: { sub: 'Checking…', look: 'plain' },
  off: { sub: 'Not on yet', look: 'plain', on: false },
  lost: { sub: 'No device registered for push', look: 'warn' },
  elsewhere: { sub: 'Pushes go to another device', look: 'warn' },
  on: { sub: 'This device is registered', look: 'on', on: true },
}

type Platform = 'iPhone' | 'iPad' | 'Android' | 'desktop'

function platformNow(): Platform {
  const ios = readIos(navigator.userAgent, navigator.maxTouchPoints)
  if (ios) return ios.device
  return /Android/i.test(navigator.userAgent) ? 'Android' : 'desktop'
}

const blockedBy: Record<Platform, string> = {
  iPhone: 'Blocked by iOS',
  iPad: 'Blocked by iPadOS',
  Android: 'Blocked by Android',
  desktop: 'Blocked by your browser',
}

/** How to allow notifications again: only the phone's or browser's settings can (decision 43). */
const unblockSteps: Record<Platform, ReactNode[]> = {
  iPhone: [
    <>
      Open iPhone <strong>Settings</strong>
    </>,
    <>
      Scroll to <strong>rud.</strong>
    </>,
    <>
      Tap <strong>Notifications → Allow</strong>
    </>,
    'Come back and pretend you never left',
  ],
  iPad: [
    <>
      Open iPad <strong>Settings</strong>
    </>,
    <>
      Scroll to <strong>rud.</strong>
    </>,
    <>
      Tap <strong>Notifications → Allow</strong>
    </>,
    'Come back and pretend you never left',
  ],
  Android: [
    <>
      Open phone <strong>Settings</strong>
    </>,
    <>
      Tap <strong>Apps → rud.</strong>
    </>,
    <>
      Tap <strong>Notifications → Allow</strong>
    </>,
    'Come back and pretend you never left',
  ],
  desktop: [
    <>
      Click <strong>⋮</strong> at the top of the rud. window
    </>,
    <>
      Click <strong>App info</strong>
    </>,
    <>
      Set <strong>Notifications</strong> to <strong>Allow</strong>
    </>,
    'Come back and pretend you never left',
  ],
}

/** An amber note with the button that registers this device. */
const warnings: Record<'lost' | 'elsewhere', { title: string; text: string; button: string }> = {
  lost: {
    title: "Pushes won't reach you.",
    text: "Registering this device didn't work. Tap below to try again.",
    button: 'Re-register this device',
  },
  elsewhere: {
    title: "Pushes won't reach you here.",
    text: 'rud. nags one device at a time, and another one took over.',
    button: 'Use this device instead',
  },
}

/**
 * Settings → Notifications: does this device get the pushes, and the one thing to do about it
 * (design doc 5.2 Settings, 5.7). Design Inventory → Phone Screens → Settings: "Notifications —
 * granted", "Notifications denied — iOS", "No device registered"; the other states: decision 43.
 */
export function NotificationsSection() {
  const { state, enable, enabling } = useNotifications()
  const toast = useToast()
  const platform = platformNow()
  const row =
    state === 'blocked'
      ? { sub: blockedBy[platform], look: 'blocked' as const, on: false }
      : rows[state]

  const turnOn = () =>
    enable({
      onSuccess: (device) => {
        if (device && state === 'elsewhere') {
          toast.success(
            'You are now receiving notifications on this device; the previous device has been removed.',
          )
        }
      },
      onError: () => toast.error("Couldn't turn on notifications. Try again."),
    })

  return (
    <section aria-labelledby="notifications">
      <h2
        id="notifications"
        className="border-b border-border px-1 pb-2 text-xs font-semibold tracking-wider text-fg2 uppercase"
      >
        Notifications
      </h2>
      <div className="flex flex-col gap-3 border-b border-border px-1 py-3.5">
        <div className="flex items-center gap-3.5">
          <span aria-hidden="true" className={bellTile({ look: row.look })}>
            <Bell size={17} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base">Push notifications</p>
            <p className="text-sm text-fg2">{row.sub}</p>
          </div>
          {row.on === undefined ? null : (
            <span className={badge({ on: row.on })}>{row.on ? 'On' : 'Off'}</span>
          )}
        </div>

        {state === 'needs-install' ? <TabInstallHint /> : null}

        {state === 'off' ? (
          <>
            <p className="text-sm text-fg2">
              Tap Enable to get nagged. Without this, rud. is just a list.
            </p>
            <Button loading={enabling} onClick={turnOn}>
              Enable notifications
            </Button>
          </>
        ) : null}

        {state === 'blocked' ? (
          <div className="flex flex-col gap-2 rounded-lg bg-nag-low px-3.5 py-3 text-nag-low-fg">
            <h3 className="text-sm font-bold">How to turn on notifications</h3>
            <ol className="flex flex-col gap-1.5">
              {unblockSteps[platform].map((step, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full bg-nag-low-fg text-xs font-bold text-nag-low"
                  >
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {state === 'lost' || state === 'elsewhere' ? (
          <>
            <p className="rounded-md bg-nag-low px-3 py-2.5 text-sm text-nag-low-fg">
              <strong>{warnings[state].title}</strong> {warnings[state].text}
            </p>
            <Button loading={enabling} onClick={turnOn}>
              {warnings[state].button}
            </Button>
          </>
        ) : null}
      </div>
    </section>
  )
}
