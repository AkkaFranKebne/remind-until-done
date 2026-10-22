import { Button as BaseButton } from '@base-ui/react/button'
import { cva } from 'class-variance-authority'
import { Link } from '@tanstack/react-router'
import { Bell, BellOff } from 'lucide-react'
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

/** The action (Enable, Show me) stands out; Later steps back. */
const action = cva(
  'group flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center px-1.5 text-sm focus-visible:outline-2 focus-visible:outline-accent',
  { variants: { quiet: { false: 'font-semibold', true: 'text-fg2' } } },
)

/**
 * The list's nudge to turn notifications on, in the installed app (design doc 5.1). Design
 * Inventory → Components → "NotifBanner":
 * - not asked yet: Enable, or Later (no API call; back next time the app starts);
 * - blocked: the browser won't ask again, so "Show me" opens Settings, which has the steps
 *   for this platform (decision 43). Later works the same.
 */
export function NotifBanner() {
  const { state, enable, enabling } = useNotifications()
  const toast = useToast()
  const [later, setLater] = useState(saidLater)

  // Stays, busy, while its own Enable is registering (the state reads "checking" then).
  const blocked = state === 'blocked' && !enabling
  if (later || !(state === 'off' || enabling || blocked)) return null

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
      aria-label={blocked ? 'Notifications are blocked' : 'Turn on notifications'}
      className="flex items-center gap-2.5 rounded-md bg-accent-bg py-1 pr-2 pl-3.5 text-sm text-accent"
    >
      {blocked ? (
        <>
          <BellOff aria-hidden="true" size={16} strokeWidth={1.75} className="shrink-0" />
          <p className="flex-1">Notifications are blocked. Here's how to fix it.</p>
          <Link to="/settings" className={action({ quiet: false })}>
            Show me
          </Link>
        </>
      ) : (
        <>
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
        </>
      )}
      <BaseButton className={action({ quiet: true })} onClick={dismiss}>
        Later
      </BaseButton>
    </section>
  )
}
