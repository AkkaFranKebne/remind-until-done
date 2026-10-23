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
  tight = false,
  showSettings = true,
  children,
}: {
  /** The TopBar icon colour that fits the background. */
  tone?: TopBarTone
  /** A background class, e.g. bg-(image:--grad-shell-brand). Default: the page background. */
  background?: string
  /** The state line under the TopBar, e.g. "3 things need your attention." */
  contextLine?: string
  /** Content starts right under the TopBar (the list's tiles, as the Inventory mockup). */
  tight?: boolean
  /** The TopBar's Settings icon; off on Settings itself (Inventory → Phone Screens → Settings). */
  showSettings?: boolean
  children: ReactNode
}) {
  return (
    <div className={cn('flex min-h-dvh flex-col bg-bg', background)}>
      <TopBar tone={tone} contextLine={contextLine} showSettings={showSettings} />
      <main
        className={cn(
          'flex flex-1 flex-col px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]',
          tight ? 'pt-1' : 'pt-4',
        )}
      >
        {children}
      </main>
    </div>
  )
}
