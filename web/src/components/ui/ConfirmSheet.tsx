import { Drawer } from '@base-ui/react/drawer'
import { CircleAlert, type LucideIcon } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { Button } from './Button'

/**
 * "Are you sure?" sheet that slides up from the bottom (Sign out, later Delete account).
 * Built on Base UI's Drawer: focus moves into the sheet and stays there; Cancel, a tap
 * outside, Escape or swiping it down close it (the sheet follows the finger); screen
 * readers hear it as an alert dialog with its title and text.
 * Design Inventory → Phone Screens → Settings → "Sign-out confirm".
 */
export function ConfirmSheet({
  open,
  onOpenChange,
  icon: Icon,
  title,
  children,
  note,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  confirming = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Shown in a red tile above the title (the action is hard to undo). */
  icon: LucideIcon
  title: string
  /** What happens, in one or two sentences. */
  children: ReactNode
  /** Extra warning in a grey box, e.g. "You'll need to reinstall ..." */
  note?: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  /** The confirmed action is running: spinner on the confirm button. */
  confirming?: boolean
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Drawer.Root
      open={open}
      swipeDirection="down"
      // While the action runs, it can't be cancelled (swipe, Escape, backdrop, Cancel).
      onOpenChange={(next) => {
        if (!confirming) onOpenChange(next)
      }}
    >
      <Drawer.Portal>
        {/* Inventory → Motion: sheet-slide / backdrop-fade (src/index.css). */}
        <Drawer.Backdrop className="fixed inset-0 bg-scrim backdrop-blur-sm backdrop-fade" />
        <Drawer.Viewport className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] flex justify-center">
          {/* Focus starts on Cancel: a reflexive Enter must not run the hard-to-undo action. */}
          <Drawer.Popup
            role="alertdialog"
            initialFocus={cancelRef}
            className="flex w-full max-w-sm flex-col items-center gap-3 rounded-lg bg-bg2 px-5 pt-3 pb-5 text-center shadow-md sheet-slide focus-visible:outline-none"
          >
            <span aria-hidden="true" className="h-1 w-10 rounded-full bg-border" />
            <span
              aria-hidden="true"
              className="mt-2 flex size-11 items-center justify-center rounded-md bg-error-bg text-error"
            >
              <Icon size={22} strokeWidth={1.75} />
            </span>
            <Drawer.Title className="text-lg font-bold text-balance">{title}</Drawer.Title>
            <Drawer.Description className="text-sm text-balance text-fg2">
              {children}
            </Drawer.Description>
            {note ? (
              <p className="flex w-full items-start gap-2 rounded-md bg-bg3 px-3 py-2.5 text-left text-xs text-fg2">
                <CircleAlert
                  aria-hidden="true"
                  size={16}
                  strokeWidth={1.75}
                  className="mt-px shrink-0"
                />
                {note}
              </p>
            ) : null}
            <div className="mt-1 flex w-full flex-col gap-2">
              <Button size="lg" loading={confirming} onClick={onConfirm}>
                {confirmLabel}
              </Button>
              <Button
                ref={cancelRef}
                size="lg"
                variant="neutral"
                disabled={confirming}
                onClick={() => onOpenChange(false)}
              >
                {cancelLabel}
              </Button>
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
