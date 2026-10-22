import { Download } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '../../components/ui/Button'
import { isTabInstallState, tabInstallLine } from './tabInstall'
import { useInstall } from './useInstall'

/**
 * Settings → Notifications in a browser tab: Install app when Chrome offers it, otherwise the
 * line for this tab (decision 44). Nothing in the installed app. Design Inventory → Phone
 * Screens → Settings, "Notifications — in a browser tab".
 */
export function TabInstallHint() {
  const { state, install } = useInstall()
  // The line is a status that stays mounted, so "Installed…" is announced when it replaces the
  // button; focus moves to it, so it doesn't drop to the page with the button.
  const line = useRef<HTMLOutputElement>(null)
  if (!isTabInstallState(state)) return null

  return (
    <>
      {state === 'installable' ? (
        <Button
          icon={Download}
          loading={install.isPending}
          onClick={() => install.mutate(undefined, { onSettled: () => line.current?.focus() })}
        >
          Install app
        </Button>
      ) : null}
      <output
        ref={line}
        tabIndex={-1}
        className="block text-sm text-fg2 empty:hidden focus-visible:outline-2 focus-visible:outline-accent"
      >
        {state === 'installable' ? null : tabInstallLine[state]}
      </output>
    </>
  )
}
