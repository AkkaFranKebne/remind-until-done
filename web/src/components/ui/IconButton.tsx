import { Button as BaseButton } from '@base-ui/react/button'
import { Link, type LinkProps } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

/**
 * Icon-only controls: IconButton (actions: Close) and IconLink (navigation: Settings, Back).
 * 44 × 44 px, 20px icon (size "sm": 16px, for ‹ Back next to a page title), no visible
 * background until hovered or pressed, so it sits on any
 * screen or gradient. The icon takes the current text colour: pass a text-* token class.
 * IconButton is built on Base UI's Button; IconLink is a real link (TanStack <Link>).
 * Design Inventory → Components → "IconButton".
 */
const base = [
  '-m-0.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md',
  'transition-colors duration-(--duration-fast) motion-reduce:transition-none',
  'hover:bg-current/10 active:bg-current/15',
  'data-disabled:cursor-not-allowed data-disabled:opacity-40 data-disabled:hover:bg-transparent',
  // The focus ring uses the icon's colour, so it's visible on every background.
  'focus-visible:outline-2 focus-visible:outline-current',
]

/** Drawn icon size; the tap area stays 44 × 44 either way. */
const iconSizes = { md: { size: 20, strokeWidth: 1.75 }, sm: { size: 16, strokeWidth: 2 } }

type Shared = {
  icon: LucideIcon
  /** md: Settings, Close (default). sm: ‹ Back next to a page title (Inventory → IconButton). */
  size?: keyof typeof iconSizes
  /** What it does, for screen readers ("Settings", "Close", "Back"). Required: there's no visible text. */
  label: string
  className?: string
}

/** For actions: Close. */
export function IconButton({
  icon: Icon,
  size = 'md',
  label,
  className = 'text-fg',
  ...rest
}: Shared &
  Omit<ComponentProps<typeof BaseButton>, 'className' | 'render' | 'children' | 'aria-label'>) {
  return (
    <BaseButton aria-label={label} className={cn(base, className)} {...rest}>
      <Icon {...iconSizes[size]} aria-hidden="true" />
    </BaseButton>
  )
}

/** For navigation: Settings, Back. */
export function IconLink({
  icon: Icon,
  size = 'md',
  label,
  className = 'text-fg',
  ...linkProps
}: Shared & Omit<LinkProps, 'className' | 'children'>) {
  return (
    <Link aria-label={label} className={cn(base, className)} {...linkProps}>
      <Icon {...iconSizes[size]} aria-hidden="true" />
    </Link>
  )
}
