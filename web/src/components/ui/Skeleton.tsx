import { cn } from '../../lib/cn'

/**
 * A grey placeholder block with a light band sliding across (animate-shimmer; still under
 * reduced motion). Size and shape come from className, so a loading screen can mirror the
 * real layout: tiles, a label line, rows. Hidden from screen readers: the area around it
 * says what's loading. Fixed light in both themes, like the rows it stands in for.
 * Design Inventory → Components → "SkeletonRow", Motion → "Skeleton shimmer".
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'h-18 rounded-md bg-shimmer animate-shimmer motion-reduce:animate-none',
        className,
      )}
    />
  )
}
