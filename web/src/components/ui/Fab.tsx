import { Button as BaseButton } from '@base-ui/react/button'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * The round "add" button, bottom-right above the home bar: 50px (44px+ tap target), the same violet as every
 * primary action, with a violet glow (shadow-fab). Icon only, so it needs a label for screen readers ("Add reminder").
 * The list hides it at the 5-reminder limit (hidden, not disabled).
 * Design Inventory → Components → "TopBar · FAB".
 */
export function Fab({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <BaseButton
      aria-label={label}
      onClick={onClick}
      className={cn(
        'fixed right-4 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] flex size-12.5 cursor-pointer items-center justify-center rounded-full bg-accent-solid text-on-solid shadow-fab',
        'transition-opacity duration-(--duration-fast) active:opacity-80 motion-reduce:transition-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className,
      )}
    >
      <Icon aria-hidden="true" size={22} strokeWidth={2} />
    </BaseButton>
  )
}
