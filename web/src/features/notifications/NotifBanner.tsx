import { Bell, BellOff, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { Banner, BannerButton, BannerLink } from '../../components/ui/Banner'
import { useToast } from '../../components/ui/useToast'
import { DAY_MS, useDismissal } from '../../lib/useDismissal'
import { MOVED_HERE_TOAST, useNotifications } from './useNotifications'

/** No pushes reach this device although it allows them: the line and the one-tap fix. */
const warnings = {
  elsewhere: {
    label: 'Pushes go to another device',
    line: "Pushes won't reach you here.",
    button: 'Use this device',
  },
  lost: { label: 'No device registered', line: "Pushes won't reach you.", button: 'Re-register' },
} as const

/**
 * The list's nudge to turn notifications on, in the installed app (design doc 5.1). Design
 * Inventory → Components → "NotifBanner":
 * - not asked yet: Enable, or Later (no API call; back after a day);
 * - blocked: the browser won't ask again, so "Show me" opens Settings, which has the steps
 *   for this platform (decision 43). Later works the same.
 * - another device has the pushes, or registering this one failed: the Settings note's line, and
 *   its button right here, so the list never looks fine while no nag can arrive (owner,
 *   2026-11-10). Later hides it for a day too.
 */
export function NotifBanner() {
  const { state, enable, enabling } = useNotifications()
  const toast = useToast()
  const [later, dismiss] = useDismissal('rud.notifBannerLater', DAY_MS)
  // Which warning's button is busy: while it registers, the state reads "checking".
  const [fixing, setFixing] = useState<keyof typeof warnings | null>(null)

  const warning = fixing ?? (state === 'elsewhere' || state === 'lost' ? state : null)
  // Stays, busy, while its own Enable is registering (the state reads "checking" then).
  const blocked = state === 'blocked' && !enabling
  if (later || !(state === 'off' || enabling || blocked || warning)) return null

  const laterButton = (
    <BannerButton quiet onClick={dismiss}>
      Later
    </BannerButton>
  )

  if (warning) {
    const { label, line, button } = warnings[warning]
    return (
      <Banner
        label={label}
        icon={Smartphone}
        actions={
          <>
            <BannerButton
              busy={enabling}
              onClick={() => {
                setFixing(warning)
                enable({
                  onSuccess: (device) => {
                    if (device && warning === 'elsewhere') toast.success(MOVED_HERE_TOAST)
                  },
                  onError: () => toast.error("Couldn't turn on notifications. Try again."),
                  onSettled: () => setFixing(null),
                })
              }}
            >
              {button}
            </BannerButton>
            {laterButton}
          </>
        }
      >
        {line}
      </Banner>
    )
  }

  if (blocked) {
    return (
      <Banner
        label="Notifications are blocked"
        icon={BellOff}
        actions={
          <>
            <BannerLink to="/settings">Show me</BannerLink>
            {laterButton}
          </>
        }
      >
        Notifications are blocked. Here&apos;s how to fix it.
      </Banner>
    )
  }

  return (
    <Banner
      label="Turn on notifications"
      icon={Bell}
      actions={
        <>
          <BannerButton
            busy={enabling}
            onClick={() =>
              enable({ onError: () => toast.error("Couldn't turn on notifications. Try again.") })
            }
          >
            Enable
          </BannerButton>
          {laterButton}
        </>
      }
    >
      Enable notifications so we can nag you.
    </Banner>
  )
}
