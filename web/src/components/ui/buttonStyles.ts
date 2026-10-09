/**
 * Classes for button-looking elements. Button uses them, and so can a <Link>
 * that should look like a button (e.g. "Go home" on the 404 page).
 * Design Inventory → Components → "Done / Remind later — primary pair" (md) and
 * Phone Screens → Login "Install app" (lg).
 */
export type ButtonVariant = 'primary' | 'ghost'

/** md: everyday buttons. lg: the one hero action on a screen (Install app, Sign in). */
export type ButtonSize = 'md' | 'lg'

const variants: Record<ButtonVariant, string> = {
  // Same violet in both themes: white text on the lighter dark-mode accent is unreadable.
  primary: 'bg-accent-solid text-on-solid',
  ghost: 'border-[1.5px] border-accent bg-transparent text-accent',
}

const sizes: Record<ButtonSize, string> = {
  md: 'h-12 gap-1.5 rounded-md px-5 text-base font-semibold', // 48px, base, 600
  lg: 'h-13 gap-2 rounded-md px-6 text-base font-bold', // 52px, base, 700
}

/** Icon size (px) per button size. */
export const buttonIconSize: Record<ButtonSize, number> = { md: 16, lg: 20 }

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className = '',
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return [
    'inline-flex items-center justify-center',
    'cursor-pointer transition-opacity duration-(--duration-fast) active:opacity-80',
    'motion-reduce:transition-none',
    'disabled:cursor-not-allowed disabled:opacity-40',
    // While loading (aria-disabled) it looks disabled too, and pressing it changes nothing.
    'aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:active:opacity-40',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    sizes[size],
    variants[variant],
    className,
  ].join(' ')
}
