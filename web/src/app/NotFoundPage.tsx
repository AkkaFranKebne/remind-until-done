import { House } from 'lucide-react'
import { ButtonLink } from '../components/ui/Button'
import { CenteredScreen } from '../components/ui/CenteredScreen'
import { TopBar } from '../components/ui/TopBar'

/** Design Inventory → Phone Screens → "Global 404" (unknown URL, not a missing reminder). */
export function NotFoundPage() {
  return (
    <CenteredScreen header={<TopBar showSettings={false} />} className="gap-3.5 px-7">
      <p aria-hidden="true" className="text-display font-bold tracking-tighter text-accent-bg">
        404
      </p>
      <h1 className="-mt-1.5 text-lg font-bold text-balance">Nothing here.</h1>
      <p className="text-sm text-balance text-fg2">
        Whatever you were looking for, it&apos;s not at this URL. Typo? Stale link? Either way —
        nothing to see.
      </p>
      <ButtonLink to="/" icon={House} className="w-full">
        Go home
      </ButtonLink>
    </CenteredScreen>
  )
}
