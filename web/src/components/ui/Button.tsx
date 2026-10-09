import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, MouseEvent } from 'react'
import { buttonClasses, buttonIconSize, type ButtonSize, type ButtonVariant } from './buttonStyles'
import { Spinner } from './Spinner'

const slotSize: Record<ButtonSize, string> = { md: 'size-4', lg: 'size-5' }

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** A Lucide icon before the text, e.g. icon={Download}. Sized and hidden from screen readers. */
  icon?: LucideIcon
  /** Shows a spinner (in the icon's place) and ignores clicks while an action runs. */
  loading?: boolean
}

/**
 * Design Inventory → Components → "Done / Remind later — primary pair", "Button — loading",
 * and Phone Screens → Login "Install app" (size lg).
 */
export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  className = '',
  children,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  // While loading, the button stays focusable (aria-disabled, not disabled),
  // so keyboard focus doesn't jump to the top of the page.
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (loading) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  const iconSize = buttonIconSize[size]
  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={handleClick}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {loading || Icon ? (
        // Fixed-size slot: the spinner is a bit smaller than the icon, so the text must not move.
        <span className={`inline-flex shrink-0 items-center justify-center ${slotSize[size]}`}>
          {loading ? (
            <Spinner
              size={size === 'lg' ? 'md' : 'sm'}
              decorative
              onAccent={variant === 'primary'}
            />
          ) : Icon ? (
            <Icon size={iconSize} strokeWidth={2} aria-hidden="true" />
          ) : null}
        </span>
      ) : null}
      {children}
    </button>
  )
}
