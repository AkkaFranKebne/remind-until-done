import type { ButtonHTMLAttributes } from 'react'
import { Spinner } from './Spinner'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
  /** Shows a spinner and blocks clicks while an action runs. */
  loading?: boolean
}

const variants = {
  primary: 'bg-accent text-white',
  ghost: 'border-[1.5px] border-accent bg-transparent text-accent',
}

/** Design Inventory → Components → "Buttons". 48px tall: an easy thumb target. */
export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'inline-flex h-12 items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-medium',
        'cursor-pointer transition-opacity duration-(--duration-fast) active:opacity-80',
        'disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        variants[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? <Spinner size="sm" onAccent={variant === 'primary'} /> : null}
      {children}
    </button>
  )
}
