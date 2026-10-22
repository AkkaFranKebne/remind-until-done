import { Download, X } from 'lucide-react'
import { useRef } from 'react'
import { Banner, BannerButton } from '../../components/ui/Banner'
import { IconButton } from '../../components/ui/IconButton'
import { DAY_MS, useDismissal } from '../../lib/useDismissal'
import { isTabInstallState, tabInstallLine } from './tabInstall'
import { useInstall } from './useInstall'

/**
 * The list's nudge to install, in a signed-in browser tab (design doc 5.1; decision 44).
 * Design Inventory → Components → "InstallBanner": Install when Chrome offers it, otherwise the
 * line for this tab; ✕ hides it for 7 days. No iPhone version: iPhone and iPad tabs can't sign in.
 */
export function InstallBanner() {
  const { state, install } = useInstall()
  const [dismissed, dismiss] = useDismissal('rud.installBannerDismissed', 7 * DAY_MS)
  // Install goes away once used: focus moves to ✕ instead of dropping to the page.
  const close = useRef<HTMLButtonElement>(null)

  if (dismissed || !isTabInstallState(state)) return null

  return (
    <Banner
      label="Install the app"
      icon={Download}
      live
      actions={
        <>
          {state === 'installable' ? (
            <BannerButton
              busy={install.isPending}
              onClick={() => install.mutate(undefined, { onSettled: () => close.current?.focus() })}
            >
              Install
            </BannerButton>
          ) : null}
          <IconButton
            ref={close}
            icon={X}
            size="sm"
            label="Hide for a week"
            className="text-fg2"
            onClick={dismiss}
          />
        </>
      }
    >
      {tabInstallLine[state]}
    </Banner>
  )
}
