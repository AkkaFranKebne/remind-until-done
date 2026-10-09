type SpinnerProps = {
  size?: 'sm' | 'md'
  /** Use on accent-coloured backgrounds (e.g. inside a primary button). */
  onAccent?: boolean
  label?: string
}

const sizes = { sm: 'size-3.5', md: 'size-[18px]' }

/** Design Inventory → Components → "Spinner". */
export function Spinner({ size = 'md', onAccent = false, label = 'Loading' }: SpinnerProps) {
  return (
    // <output> is announced by screen readers like role="status".
    <output
      aria-label={label}
      className={[
        'inline-block shrink-0 animate-spin rounded-full border-2 motion-reduce:animate-none',
        sizes[size],
        onAccent ? 'border-white/30 border-t-white' : 'border-border border-t-accent',
      ].join(' ')}
    />
  )
}
