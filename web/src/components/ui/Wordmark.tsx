import { cn } from '../../lib/cn'

/**
 * The big "rud." wordmark, centred on screens without a TopBar (login, splash).
 * One "rud." per screen: where this is shown, there is no TopBar logo.
 * Design Inventory → Tokens → Type scale ("Login wordmark": --text-display) and
 * Phone Screens → Login, Global overlays → "Splash / auth loading".
 */
export function Wordmark({
  as: Tag = 'p',
  className,
}: {
  /** h1 on the login page (it is the page title), p elsewhere. */
  as?: 'h1' | 'p'
  className?: string
}) {
  return (
    <Tag className={cn('text-display font-bold tracking-tighter text-accent', className)}>rud.</Tag>
  )
}
