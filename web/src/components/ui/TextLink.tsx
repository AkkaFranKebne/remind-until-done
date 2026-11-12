import type { ReactNode } from 'react'

/**
 * A small grey underlined link to a page outside the app, like the privacy notice. A plain <a>,
 * not TanStack's Link: the browser loads the page in full instead of the app routing it.
 * 44px tall for an easy tap. Design Inventory → Components → Text link.
 */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-11 items-center rounded-sm px-2 text-sm font-medium text-fg2 underline underline-offset-4 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
    >
      {children}
    </a>
  )
}
