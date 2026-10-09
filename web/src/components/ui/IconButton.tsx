import { Link, type LinkProps } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

/**
 * Icon-only controls: Settings, Close, Back. 44 × 44 px (an easy thumb target), 20px icon,
 * no visible background until hovered or pressed, so it sits on any screen or gradient.
 * The icon takes the current text colour: set it with a text-* token class.
 * Design Inventory → Components → "IconButton".
 */
function iconButtonClasses(className: string) {
  return [
    '-m-0.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px]',
    'transition-colors duration-(--duration-fast) motion-reduce:transition-none',
    'hover:bg-current/10 active:bg-current/15',
    // The focus ring uses the icon's colour, so it's visible on every background.
    'focus-visible:outline-2 focus-visible:outline-current',
    className,
  ].join(' ')
}

type Shared = {
  icon: LucideIcon
  /** What it does, for screen readers ("Settings", "Close", "Back"). Required: there's no visible text. */
  label: string
  className?: string
}

/** For actions (Close). */
export function IconButton({
  icon: Icon,
  label,
  className = 'text-fg',
  type = 'button',
  ...rest
}: Shared & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'>) {
  return (
    <button type={type} aria-label={label} className={iconButtonClasses(className)} {...rest}>
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}

/** For navigation (Settings, Back): a router link that looks like an IconButton. */
export function IconLink({
  icon: Icon,
  label,
  className = 'text-fg',
  ...linkProps
}: Shared & Omit<LinkProps, 'children'>) {
  return (
    <Link aria-label={label} className={iconButtonClasses(className)} {...linkProps}>
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
    </Link>
  )
}
