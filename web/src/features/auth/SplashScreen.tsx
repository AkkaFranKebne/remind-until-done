import { Spinner } from '../../components/ui/Spinner'
import { Wordmark } from '../../components/ui/Wordmark'

/**
 * While Firebase restores the session on start (usually a blink).
 * No TopBar: the big wordmark is the one "rud." on screen.
 * Design Inventory → Phone Screens → Global overlays → "Splash / auth loading".
 */
export function SplashScreen() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
      <Wordmark />
      {/* The text is the status for screen readers; the spinner is only decoration. */}
      <Spinner decorative />
      <output className="text-xs text-fg3">Checking your session…</output>
    </main>
  )
}
