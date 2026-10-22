import { Button as BaseButton } from '@base-ui/react/button'
import { cva } from 'class-variance-authority'
import { Bell } from 'lucide-react'
import { useState } from 'react'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/useToast'
import { useNotifications } from './useNotifications'

/** "Later" hides the banner until the app starts again (sessionStorage: this run of the app). */
const LATER_KEY = 'rud.notifBannerLater'

function saidLater(): boolean {
  try {
    return sessionStorage.getItem(LATER_KEY) === '1'
  } catch {
    return false
  }
}

/** Enable is the action; Later steps back. */
const action = cva(
  'group min-h-11 min-w-11 shrink-0 cursor-pointer px-1.5 text-sm focus-visible:outline-2 focus-visible:outline-accent',
  { variants: { quiet: { false: 'font-semibold', true: 'text-fg2' } } },
)

/**
 * The list's nudge to turn notifications on, in the installed app before you've been asked
 * (design doc 5.1). Design Inventory → Components → "NotifBanner": Enable, or Later (no API call;
 * back next time the app starts).
 */
export function NotifBanner() {
  const { state, enable, enabling } = useNotifications()
  const toast = useToast()
  const [later, setLater] = useState(saidLater)

  // Stays, busy, while its own Enable is registering (the state reads "checking" then).
  if (later || !(state === 'off' || enabling)) return null

  const dismiss = () => {
    try {
      sessionStorage.setItem(LATER_KEY, '1')
    } catch {
      // Blocked storage: hidden for now, back on the next visit to the list.
    }
    setLater(true)
  }

  return (
    <section
      aria-label="Turn on notifications"
      className="flex items-center gap-2.5 rounded-md bg-accent-bg py-1 pr-2 pl-3.5 text-sm text-accent"
    >
      <Bell aria-hidden="true" size={16} strokeWidth={1.75} className="shrink-0" />
      <p className="flex-1">Enable notifications so we can nag you.</p>
      {/* Busy: the label stays (keeps the name and the width), hidden under a spinner. */}
      <BaseButton
        className={action({ quiet: false })}
        disabled={enabling}
        focusableWhenDisabled
        aria-busy={enabling || undefined}
        onClick={() =>
          enable({ onError: () => toast.error("Couldn't turn on notifications. Try again.") })
        }
      >
        <span className="grid place-items-center">
          <span className="col-start-1 row-start-1 group-aria-busy:invisible">Enable</span>
          <span className="col-start-1 row-start-1 hidden group-aria-busy:block">
            <Spinner size="sm" decorative />
          </span>
        </span>
      </BaseButton>
      <BaseButton className={action({ quiet: true })} onClick={dismiss}>
        Later
      </BaseButton>
    </section>
  )
}
