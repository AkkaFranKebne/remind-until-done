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
    // the arrow lines up with the content, and the title in to an 8px gap (Inventory mockup).
    <div className="-ml-3.5 flex items-center">
      <IconLink to={backTo} icon={ChevronLeft} size="sm" label="Back" className="text-accent" />
      <h1 className="-ml-1.5 text-lg font-bold">{title}</h1>
    </div>
  )
}
