import { Button as BaseButton } from '@base-ui/react/button'
import { Link, type LinkProps } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'
import { Spinner } from './Spinner'

/**
 * Button (actions) and ButtonLink (navigation): one look, two jobs.
 * - Button is built on Base UI's Button: behaviour, focus, disabled handling.
 * - ButtonLink is a real link (TanStack <Link>), so screen readers say "link" and
 *   long-press / open-in-new-tab work. Never make a navigation a button, or the reverse.
 * Design Inventory → Components → "Done / Remind later — primary pair", "Button — loading",
 * and Phone Screens → Login "Install app" (size lg).
 */

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center rounded-md text-base',
    'cursor-pointer transition-opacity duration-(--duration-fast) active:opacity-80',
    'motion-reduce:transition-none',
    // Base UI marks disabled (and loading) buttons with data-disabled.
    'data-disabled:cursor-not-allowed data-disabled:opacity-40 data-disabled:active:opacity-40',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  ],
  {
    variants: {
      variant: {
        // Same violet in both themes: white text on the lighter dark-mode accent is unreadable.
        primary: 'bg-accent-solid text-on-solid',
        ghost: 'border-strong border-accent bg-transparent text-accent',
      },
      /** md: everyday buttons (48px). lg: the one hero action on a screen (52px, Install app). */
      size: {
        md: 'h-12 gap-1.5 px-5 font-semibold',
        lg: 'h-13 gap-2 px-6 font-bold',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

type Variants = VariantProps<typeof buttonVariants>
export type ButtonVariant = NonNullable<Variants['variant']>
export type ButtonSize = NonNullable<Variants['size']>

/** The icon (or spinner) slot plus the label. Fixed-size slot, so the label never moves. */
function Content({
  size,
  variant,
  icon: Icon,
  loading = false,
  children,
}: {
  size: ButtonSize
  variant: ButtonVariant
  icon?: LucideIcon
  loading?: boolean
  children: ReactNode
}) {
  return (
    <>
      {loading || Icon ? (
        <span
          className={`inline-flex shrink-0 items-center justify-center ${size === 'lg' ? 'size-5' : 'size-4'}`}
        >
          {loading ? (
            <Spinner
              size={size === 'lg' ? 'md' : 'sm'}
              decorative
              onAccent={variant === 'primary'}
            />
          ) : Icon ? (
            <Icon size={size === 'lg' ? 20 : 16} strokeWidth={2} aria-hidden="true" />
          ) : null}
        </span>
      ) : null}
      {children}
    </>
  )
}

type Shared = {
  variant?: ButtonVariant
  size?: ButtonSize
  /** A Lucide icon before the text, e.g. icon={Download}. Sized and hidden from screen readers. */
  icon?: LucideIcon
  className?: string
  children: ReactNode
}

/** For actions: Done, Save, Install app. */
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  className = '',
  children,
  ...rest
}: Shared &
  Omit<ComponentProps<typeof BaseButton>, 'className' | 'render' | 'children'> & {
    /** Shows a spinner (in the icon's place), ignores clicks, keeps keyboard focus. */
    loading?: boolean
  }) {
  return (
    <BaseButton
      // While loading it's disabled but keeps keyboard focus (focus doesn't jump to the top).
      disabled={disabled || loading}
      focusableWhenDisabled={loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    >
      <Content size={size} variant={variant} icon={icon} loading={loading}>
        {children}
      </Content>
    </BaseButton>
  )
}

/** For navigation that looks like a button: Go home. A real link (TanStack <Link>). */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  children,
  ...linkProps
}: Shared & Omit<LinkProps, 'className' | 'children'>) {
  return (
    <Link className={cn(buttonVariants({ variant, size }), className)} {...linkProps}>
      <Content size={size} variant={variant} icon={icon}>
        {children}
      </Content>
    </Link>
  )
}
