import { CircleAlert, type LucideIcon } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { Sheet, SheetDescription, SheetTitle } from './Sheet'

/**
 * "Are you sure?" sheet that slides up from the bottom (Sign out, Discard a draft, Delete a
 * reminder). Built on our Sheet (Base UI Drawer): Cancel, a tap outside, Escape or swiping it
 * down close it, or only Cancel with cancelOnly; screen readers hear it as an alert dialog with its title and text.
 * Design Inventory → Components → "ConfirmSheet", Phone Screens → Settings → "Sign-out confirm".
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
  confirmDisabled = false,
  danger = false,
  cancelOnly = false,
  extra,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Shown in a red tile above the title (the action is hard to undo). */
  icon: LucideIcon
  title: string
  /** What happens, in one or two sentences. */
  children: ReactNode
  /** Extra warning in a grey box, under the text. */
  note?: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  /** The confirmed action is running: spinner on the confirm button. */
  confirming?: boolean
  /** The confirm button can't be used yet (the typed DELETE doesn't match). */
  confirmDisabled?: boolean
  /** The action deletes or throws away something: red confirm button (Inventory "red danger"). */
  danger?: boolean
  /** Only Cancel closes it, not a swipe, a tap outside or Escape: typed text mustn't be lost. */
  cancelOnly?: boolean
  /** Between the text and the buttons: a field to fill in, or an error. */
  extra?: ReactNode
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Sheet
      open={open}
      // While the action runs, it can't be cancelled (swipe, Escape, backdrop, Cancel).
      onOpenChange={(next) => {
        if (!confirming && !cancelOnly) onOpenChange(next)
      }}
      dismissible={!cancelOnly}
      role="alertdialog"
      // Focus starts on Cancel: a reflexive Enter must not run the hard-to-undo action.
      initialFocus={cancelRef}
    >
      <span
        aria-hidden="true"
        className="mt-2 flex size-11 shrink-0 items-center justify-center rounded-md bg-error-bg text-error-text"
      >
        <Icon size={22} strokeWidth={1.75} />
      </span>
      <SheetTitle className="text-lg font-bold text-balance">{title}</SheetTitle>
      <SheetDescription className="text-sm text-balance text-fg2">{children}</SheetDescription>
      {note ? (
        <p className="flex w-full items-start gap-2 rounded-md bg-bg3 px-3 py-2.5 text-left text-xs text-fg2">
          <CircleAlert aria-hidden="true" size={16} strokeWidth={1.75} className="mt-px shrink-0" />
          {note}
        </p>
      ) : null}
      {extra}
      <div className="mt-1 flex w-full flex-col gap-2">
        <Button
          size="lg"
          variant={danger ? 'danger' : 'primary'}
          loading={confirming}
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
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
    </Sheet>
  )
}
