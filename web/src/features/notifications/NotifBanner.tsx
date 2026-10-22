import { Bell, BellOff } from 'lucide-react'
import { Banner, BannerButton, BannerLink } from '../../components/ui/Banner'
import { useToast } from '../../components/ui/useToast'
import { DAY_MS, useDismissal } from '../../lib/useDismissal'
import { useNotifications } from './useNotifications'

/**
 * The list's nudge to turn notifications on, in the installed app (design doc 5.1). Design
 * Inventory → Components → "NotifBanner":
 * - not asked yet: Enable, or Later (no API call; back after a day);
 * - blocked: the browser won't ask again, so "Show me" opens Settings, which has the steps
 *   for this platform (decision 43). Later works the same.
 */
export function NotifBanner() {
  const { state, enable, enabling } = useNotifications()
  const toast = useToast()
  const [later, dismiss] = useDismissal('rud.notifBannerLater', DAY_MS)

  // Stays, busy, while its own Enable is registering (the state reads "checking" then).
  const blocked = state === 'blocked' && !enabling
  if (later || !(state === 'off' || enabling || blocked)) return null

  const laterButton = (
    <BannerButton quiet onClick={dismiss}>
      Later
    </BannerButton>
  )

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
