import type { ButtonHTMLAttributes, MouseEvent } from 'react'
import { buttonClasses, type ButtonVariant } from './buttonStyles'
import { Spinner } from './Spinner'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  /** Shows a spinner and ignores clicks while an action runs. */
  loading?: boolean
}

/** Design Inventory → Components → "Done / Remind later — primary pair" and "Button — loading". */
export function Button({
  variant = 'primary',
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

  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={handleClick}
      className={buttonClasses(variant, className)}
      {...rest}
    >
      {loading ? <Spinner size="sm" decorative onAccent={variant === 'primary'} /> : null}
      {children}
    </button>
  )
}
