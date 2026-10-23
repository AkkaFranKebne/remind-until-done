import type { LinkProps } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { IconLink } from './IconButton'

/**
 * The top of a signed-in page, under the TopBar: ‹ Back + the page title.
 * Settings now, the reminder page in M2. The title is the page's only h1.
 * Design Inventory → Phone Screens → Settings ("‹ Settings").
 */
export function PageHeader({ title, backTo }: { title: string; backTo: LinkProps['to'] }) {
  return (
    // The 16px arrow sits in a 44px tap area (14px of space each side): pull the row left so
    // the arrow lines up with the content. The title starts right after the tap area, not inside
    // it, so the button's hover background never runs under the title (owner 2026-10-23).
    <div className="-ml-3.5 flex items-center gap-1">
      <IconLink to={backTo} icon={ChevronLeft} size="sm" label="Back" className="text-accent" />
      <h1 className="text-lg font-bold">{title}</h1>
    </div>
  )
}
