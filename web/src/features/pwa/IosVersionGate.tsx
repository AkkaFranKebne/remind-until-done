import { Smartphone } from 'lucide-react'
import { CenteredScreen } from '../../components/ui/CenteredScreen'
import { TopBar } from '../../components/ui/TopBar'
import { MIN_IOS, type Ios } from './platform'

/**
 * iOS before 16.4 has no web push, and rud. is nothing without it: a friendly hard stop, no
 * way around it (design doc §0). Design Inventory → Phone Screens → Global overlays
 * "iOS version gate".
 */
export function IosVersionGate({ ios }: { ios: Ios }) {
  const minimum = MIN_IOS.join('.')
  return (
    <CenteredScreen header={<TopBar showSettings={false} />} className="gap-3.5 px-7">
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-lg bg-(image:--grad-login-icon) text-install-fg"
      >
        <Smartphone size={32} strokeWidth={1.5} />
      </span>
      <h1 className="text-lg font-bold text-balance">You&apos;ll need iOS {minimum} or later.</h1>
      <p className="text-sm text-balance text-fg2">
        Push notifications — rud.&apos;s entire personality — require iOS {minimum}. Update your{' '}
        {ios.device} and we&apos;ll be here waiting.
      </p>
      {ios.version ? (
        <p className="font-mono text-xs font-semibold text-fg2">
          Your version: iOS {ios.version.join('.')}
        </p>
      ) : null}
    </CenteredScreen>
  )
}
