import type { ReactNode } from 'react'
import { TopBar, type TopBarTone } from '../components/ui/TopBar'
import { cn } from '../lib/cn'

/**
 * The frame of every signed-in screen: the TopBar and the page content, on the screen's own
 * background. Each screen picks its look (Inventory → Phone Screens): the list sits on a
 * gradient that follows the picked tile; Settings on the plain background.
 */
export function AppScreen({
  tone = 'plain',
  background,
  contextLine,
  children,
}: {
  /** The TopBar icon colour that fits the background. */
  tone?: TopBarTone
  /** A background class, e.g. bg-(image:--grad-shell-brand). Default: the page background. */
  background?: string
  /** The state line under the TopBar, e.g. "3 things need your attention." */
  contextLine?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex min-h-dvh flex-col bg-bg', background)}>
      <TopBar tone={tone} contextLine={contextLine} />
      <main className="flex-1 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  )
}
