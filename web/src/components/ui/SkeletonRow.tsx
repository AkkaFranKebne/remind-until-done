import { cn } from '../../lib/cn'

/**
 * A grey placeholder the size of a reminder row (80px), with a light band sliding across
 * while the list loads (animate-shimmer; still under reduced motion). Hidden from screen
 * readers: the list around it says "Loading reminders".
 * Design Inventory → Components → "SkeletonRow", Motion → "Skeleton shimmer".
 */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'h-20 rounded-md bg-shimmer shadow-sm animate-shimmer motion-reduce:animate-none',
        className,
      )}
    />
  )
}
