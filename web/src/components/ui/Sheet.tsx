import { Drawer } from '@base-ui/react/drawer'
import { cva } from 'class-variance-authority'
import type { ReactNode, RefObject } from 'react'
import { cn } from '../../lib/cn'

/**
 * Every bottom sheet in the app: confirmations (ConfirmSheet) and forms (AddReminderSheet).
 * Built on Base UI's Drawer: focus moves in and stays in; a tap outside, Escape or swiping
 * it down closes it (the sheet follows the finger); it slides in and out with sheet-slide
 * and its backdrop fades (Inventory → Motion 1). The handle bar invites the swipe.
 * - card: a floating card above the bottom edge (confirmations).
 * - full: attached to the bottom edge, full width, rounded top (forms). With snapPoints it
 *   is full height (below the status bar) and rests at the first snap point (sheet-tall).
 * Design Inventory → Components → "ConfirmSheet", Phone Screens → "AddReminderSheet".
 */
const viewport = cva('fixed flex justify-center', {
  variants: {
    layout: {
      card: 'inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))]',
      full: 'inset-x-0 bottom-0',
    },
  },
})

const popup = cva('flex w-full flex-col bg-bg2 shadow-md sheet-slide focus-visible:outline-none', {
  variants: {
    layout: {
      card: 'max-w-sm items-center gap-3 rounded-lg px-5 pt-3 pb-5 text-center',
      full: 'max-w-lg rounded-t-lg pt-3',
    },
  },
})

export type SheetLayout = 'card' | 'full'

export function Sheet({
  open,
  onOpenChange,
  layout = 'card',
  role,
  initialFocus,
  snapPoints,
  snapPoint,
  onSnapPointChange,
  className,
  children,
}: {
  open: boolean
  /** Asked to open or close (Escape, tap outside, swipe, a Close button). Ignore it to stay open. */
  onOpenChange: (open: boolean) => void
  layout?: SheetLayout
  /** alertdialog for "are you sure?" sheets; dialog (default) otherwise. */
  role?: 'dialog' | 'alertdialog'
  /** Where focus goes when it opens (default: the first focusable element). */
  initialFocus?: RefObject<HTMLElement | null>
  /** Heights it can rest at, as parts of the sheet's full height (0.85, 1 = full) or pixels; full layout only. */
  snapPoints?: Drawer.Root.SnapPoint[]
  snapPoint?: Drawer.Root.SnapPoint | null
  onSnapPointChange?: (snapPoint: Drawer.Root.SnapPoint | null) => void
  className?: string
  children: ReactNode
}) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      swipeDirection="down"
      snapPoints={snapPoints}
      snapPoint={snapPoint}
      onSnapPointChange={(next) => onSnapPointChange?.(next)}
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 bg-scrim backdrop-blur-sm backdrop-fade" />
        {/* Form sheets: Base UI keeps the focused field above the phone's on-screen keyboard. */}
        <Drawer.VirtualKeyboardProvider>
          <Drawer.Viewport className={viewport({ layout })}>
            <Drawer.Popup
              // Only when set: an explicit undefined would remove Base UI's defaults
              // (role="dialog", focus on the first focusable element).
              {...(role ? { role } : {})}
              {...(initialFocus ? { initialFocus } : {})}
              className={cn(popup({ layout }), snapPoints && 'sheet-tall', className)}
            >
              <span
                aria-hidden="true"
                className="mx-auto h-1 w-10 shrink-0 rounded-full bg-border"
              />
              {children}
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.VirtualKeyboardProvider>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/** The sheet's heading: names the dialog for screen readers. */
export const SheetTitle = Drawer.Title
/** The sheet's main text: describes the dialog for screen readers. */
export const SheetDescription = Drawer.Description
/** The part of a sheet that scrolls; dragging inside it scrolls instead of moving the sheet. */
export const SheetContent = Drawer.Content
