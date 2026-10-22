import { Toast } from '@base-ui/react/toast'
import { cva } from 'class-variance-authority'
import { Check, CircleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type ToastTone = 'success' | 'error'

/** Status colours: done green for success, nagging red for errors (both have dark values). */
const toastTone = cva(
  [
    // The strip around it lets taps through (the + button sits there); the toast itself doesn't.
    'pointer-events-auto flex items-center gap-2.5 rounded-md px-4 py-3 text-sm font-medium shadow-md',
    // Fades in and out; follows the finger when swiped away (down or right, Base UI's default).
    'translate-x-(--toast-swipe-movement-x) translate-y-(--toast-swipe-movement-y)',
    'transition-opacity duration-(--duration-base) ease-(--easing-std) motion-reduce:transition-none',
    'data-starting-style:opacity-0 data-ending-style:opacity-0 data-limited:hidden',
  ],
  {
    variants: {
      tone: {
        success: 'bg-tag-done text-tag-done-fg',
        // --tag-nagging is see-through in dark mode: lay it over the solid card colour so the
        // toast stays readable on top of the list (light mode: the same colour as the Inventory).
        error: 'bg-bg2 bg-linear-to-r from-tag-nagging to-tag-nagging text-tag-nagging-fg',
      } satisfies Record<ToastTone, string>,
    },
  },
)

const toneIcon = { success: Check, error: CircleAlert } satisfies Record<ToastTone, LucideIcon>

/**
 * Short messages at the bottom of the screen ("Finally. Done."), built on Base UI's Toast: it
 * announces them to screen readers, pauses while hovered or focused, and F6 moves focus to them.
 * One at a time (a new one replaces the old), gone after 4 s. Wrap the app once; show one
 * with useToast() (useToast.ts).
 * Design Inventory → Components → "Toast · Banners · ConfirmSheet".
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider timeout={4000} limit={1}>
      {children}
      <Toast.Portal>
        <Toast.Viewport
          // Base UI names it "Notifications"; that's also Settings' section about pushes.
          aria-label="Messages"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
        >
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((toast) => {
    const tone: ToastTone = toast.type === 'error' ? 'error' : 'success'
    const Icon = toneIcon[tone]
    return (
      <Toast.Root key={toast.id} toast={toast} className={toastTone({ tone })}>
        <Icon aria-hidden="true" size={16} strokeWidth={2} className="shrink-0" />
        {/* A sentence, not a heading (Base UI's default is <h2>). */}
        <Toast.Title render={<p />} />
      </Toast.Root>
    )
  })
}
