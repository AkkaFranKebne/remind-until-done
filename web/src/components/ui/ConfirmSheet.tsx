import { AlertDialog } from '@base-ui/react/alert-dialog'
import { CircleAlert, type LucideIcon } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { Button } from './Button'

/**
 * "Are you sure?" sheet that slides up from the bottom (Sign out, later Delete account).
 * Built on Base UI's AlertDialog: focus moves into the sheet and stays there, Escape
 * and the backdrop close it, and screen readers announce the title and text.
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
    <AlertDialog.Root
      open={open}
      // While the action runs, it can't be cancelled (Escape, backdrop, Cancel).
      onOpenChange={(next) => {
        if (!confirming) onOpenChange(next)
      }}
    >
      <AlertDialog.Portal>
        {/* Inventory → Motion: the backdrop fades and the sheet slides up (--duration-base). */}
        <AlertDialog.Backdrop className="fixed inset-0 bg-scrim backdrop-blur-sm transition-opacity duration-(--duration-base) ease-std data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        {/* Focus starts on Cancel: a reflexive Enter must not run the hard-to-undo action. */}
        <AlertDialog.Popup
          initialFocus={cancelRef}
          className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] mx-auto flex max-w-sm flex-col items-center gap-3 rounded-lg bg-bg2 px-5 pt-3 pb-5 text-center shadow-md transition-transform duration-(--duration-base) ease-std focus-visible:outline-none data-ending-style:translate-y-full data-starting-style:translate-y-full motion-reduce:transition-none"
        >
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-border" />
          <span
            aria-hidden="true"
            className="mt-2 flex size-11 items-center justify-center rounded-md bg-error-bg text-error"
          >
            <Icon size={22} strokeWidth={1.75} />
          </span>
          <AlertDialog.Title className="text-lg font-bold text-balance">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-balance text-fg2">
            {children}
          </AlertDialog.Description>
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
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
