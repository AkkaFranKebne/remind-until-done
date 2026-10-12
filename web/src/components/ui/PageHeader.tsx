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
    <div className="-ml-3 flex items-center gap-1">
      <IconLink to={backTo} icon={ChevronLeft} label="Back" className="text-accent" />
      <h1 className="text-lg font-bold">{title}</h1>
    </div>
  )
}
