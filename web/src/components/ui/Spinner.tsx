import { cva } from 'class-variance-authority'
type SpinnerProps = {
  size?: 'sm' | 'md'
  /** Use on the solid accent (inside a primary button). */
  onAccent?: boolean
  /** Screen-reader text. Ignored when decorative. */
  label?: string
  /**
   * Hidden from screen readers. Use inside something that already says it's busy
   * (a Button with aria-busy), so the label isn't read as part of the button's name.
   */
  decorative?: boolean
}

const spinnerVariants = cva(
  'inline-block shrink-0 animate-spin-fast rounded-full border-2 motion-reduce:animate-none',
  {
    variants: {
      size: { sm: 'size-3.5', md: 'size-4.5' },
      onAccent: {
        true: 'border-on-solid/30 border-t-on-solid',
        false: 'border-border border-t-accent',
      },
    },
  },
)

/** Design Inventory → Components → "Button — loading" (spinner: 0.7s per turn). */
export function Spinner({
  size = 'md',
  onAccent = false,
  label = 'Loading',
  decorative = false,
}: SpinnerProps) {
  const className = spinnerVariants({ size, onAccent })

  if (decorative) return <span aria-hidden="true" className={className} />
  // <output> is announced by screen readers like role="status".
  return <output aria-label={label} className={className} />
}
