/**
 * Classes for button-looking elements. Button uses them, and so can a <Link>
 * that should look like a button (e.g. "Go home" on the 404 page).
 * Design Inventory → Components → "Done / Remind later — primary pair".
 */
export type ButtonVariant = 'primary' | 'ghost'

const variants: Record<ButtonVariant, string> = {
  // Same violet in both themes: white text on the lighter dark-mode accent is unreadable.
  primary: 'bg-accent-solid text-on-solid',
  ghost: 'border-[1.5px] border-accent bg-transparent text-accent',
}

export function buttonClasses(variant: ButtonVariant = 'primary', extra = '') {
  return [
    // 48px tall: an easy thumb target.
    'inline-flex h-12 items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-medium',
    'cursor-pointer transition-opacity duration-(--duration-fast) active:opacity-80',
    'motion-reduce:transition-none',
    'disabled:cursor-not-allowed disabled:opacity-40',
    'aria-disabled:cursor-not-allowed',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    variants[variant],
    extra,
  ].join(' ')
}
