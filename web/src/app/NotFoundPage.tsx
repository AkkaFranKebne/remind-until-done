import { Link } from '@tanstack/react-router'
import { House } from 'lucide-react'
import { buttonClasses } from '../components/ui/buttonStyles'
import { TopBar } from '../components/ui/TopBar'

/** Design Inventory → Phone Screens → "Global 404" (unknown URL, not a missing reminder). */
export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar showSettings={false} />
      <main className="flex flex-1 flex-col items-center justify-center gap-3.5 p-7 text-center">
        <p
          aria-hidden="true"
          className="text-7xl leading-none font-bold tracking-[-3px] text-accent-bg"
        >
          404
        </p>
        <h1 className="-mt-1.5 text-[19px] font-bold text-balance">Nothing here.</h1>
        <p className="text-[13px] text-balance text-fg2">
          Whatever you were looking for, it&apos;s not at this URL. Typo? Stale link? Either way —
          nothing to see.
        </p>
        <Link to="/" className={buttonClasses({ className: 'w-full' })}>
          <House size={16} strokeWidth={2} aria-hidden="true" />
          Go home
        </Link>
      </main>
    </div>
  )
}
