import { Button as BaseButton } from '@base-ui/react/button'
import { Link, type LinkProps } from '@tanstack/react-router'
import { cva } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Spinner } from './Spinner'

/**
 * A one-line nudge at the top of the list: an icon, a short line, then its actions (a
 * BannerButton or BannerLink, and a quiet one to step back). Not sticky: it scrolls with the
 * page, like the TopBar. Design Inventory → Components → "NotifBanner · OfflineBanner",
 * "InstallBanner".
 */
export function Banner({
  label,
  icon: Icon,
  children,
  actions,
  live = false,
}: {
  /** The banner's name for screen readers (it's a region). */
  label: string
  icon: LucideIcon
  /** The line. */
  children: ReactNode
  actions?: ReactNode
  /** The line changes while shown (e.g. "Installed…" after Install): announce it (a status). */
  live?: boolean
}) {
  return (
    <section
      aria-label={label}
      className="flex items-center gap-2.5 rounded-md bg-accent-bg py-1 pr-2 pl-3.5 text-sm text-accent"
    >
      <Icon aria-hidden="true" size={16} strokeWidth={1.75} className="shrink-0" />
      {live ? (
        <output className="block flex-1">{children}</output>
      ) : (
        <p className="flex-1">{children}</p>
      )}
      {actions}
    </section>
  )
}

/** The action (Enable, Install, Show me) stands out; quiet ones (Later) step back. 44 px. */
const action = cva(
  'group flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center px-1.5 text-sm focus-visible:outline-2 focus-visible:outline-accent',
  { variants: { quiet: { false: 'font-semibold', true: 'text-fg2' } } },
)

/**
 * A banner's button. While `busy` it keeps its label (and so its name and width) under a
 * spinner, stays focusable and says aria-busy.
 */
export function BannerButton({
  quiet = false,
  busy = false,
  children,
  ...rest
}: {
  quiet?: boolean
  busy?: boolean
  children: ReactNode
} & Omit<ComponentProps<typeof BaseButton>, 'className' | 'children' | 'disabled'>) {
  return (
    <BaseButton
      className={action({ quiet })}
      disabled={busy}
      focusableWhenDisabled
      aria-busy={busy || undefined}
      {...rest}
    >
      <span className="grid place-items-center">
        <span className="col-start-1 row-start-1 group-aria-busy:invisible">{children}</span>
        <span className="col-start-1 row-start-1 hidden group-aria-busy:block">
          <Spinner size="sm" decorative />
        </span>
      </span>
    </BaseButton>
  )
}

/** A banner's action that goes to another page ("Show me"): a real link, styled as the action. */
export function BannerLink({ children, ...linkProps }: Omit<LinkProps, 'className'>) {
  return (
    <Link className={action({ quiet: false })} {...linkProps}>
      {children}
    </Link>
  )
}
