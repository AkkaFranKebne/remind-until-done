import { House } from 'lucide-react'
import { ButtonLink } from '../components/ui/Button'
import { TopBar } from '../components/ui/TopBar'

/** Design Inventory → Phone Screens → "Global 404" (unknown URL, not a missing reminder). */
export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar showSettings={false} />
      <main className="flex flex-1 flex-col items-center justify-center gap-3.5 p-7 text-center">
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
      </main>
    </div>
  )
}
