import { Button } from '@base-ui/react/button'
import { cva } from 'class-variance-authority'
import { Check, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'

/** Width of the revealed Delete button (w-22), in px. */
const REVEAL = 88
/** A drag shorter than this (px) is still a tap. */
const SLOP = 8
/** Sideways only when clearly more sideways than down: a slanted scroll stays a scroll. */
const SIDEWAYS = 1.5
/** Swipe right past this share of the row's width to mark it done (Inventory → Motion 2). */
const DONE_AT = 0.4
/** How long the row takes to slide out (--duration-base); snapping back uses --duration-fast. */
const LEAVE_MS = 220

type Side = 'done' | 'delete'
type Motion = 'dragging' | 'snapping' | 'leaving'

/** What shows under the row while it moves: green Done (right) or red Delete (left). */
const underneath = cva(
  'absolute inset-0 flex items-center overflow-hidden rounded-md text-sm font-semibold',
  {
    variants: {
      side: {
        done: 'bg-tag-done px-4 text-tag-done-fg',
        delete: 'justify-end bg-error text-on-solid',
      } satisfies Record<Side, string>,
    },
  },
)

/** The row follows the finger while dragged; it snaps back fast and slides out (Done) slower. */
const slide = cva('relative touch-pan-y motion-reduce:transition-none', {
  variants: {
    motion: {
      dragging: '',
      snapping: 'transition-transform duration-(--duration-fast) ease-(--easing-std)',
      leaving: 'transition-transform duration-(--duration-base) ease-(--easing-std)',
    } satisfies Record<Motion, string>,
  },
})

type Drag = { x: number; y: number; from: number; axis: 'x' | 'y' | null }

/**
 * A reminder row you can swipe. Right, past 40% of its width: Done (the row slides out).
 * Left: uncovers a red Delete button; tapping it deletes (the two steps are the confirmation,
 * no sheet). The row stays open until you tap Delete, swipe it back, or tap anywhere else.
 * Hand-built: Base UI has no swipeable list item. Vertical drags stay page scrolls
 * (touch-action: pan-y). Without swiping (keyboard, screen readers), the row is still a link
 * to the reminder page, which has Done and Delete.
 * Design Inventory → Motion 2 "Swipe row gesture"; Inspiration "Swipe gestures on list rows".
 */
export function SwipeableRow({
  label,
  onDone,
  onDelete,
  children,
}: {
  /** The reminder's title, for the Delete button's name ("Delete Call dentist"). */
  label: string
  onDone: () => void
  onDelete: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  // A drag just ended: the click that follows must not open the reminder.
  const dragged = useRef(false)
  // The live position (read in the handlers) and its copy in state (for drawing).
  const live = useRef(0)
  const [offset, setOffsetState] = useState(0)
  const setOffset = (x: number) => {
    live.current = x
    setOffsetState(x)
  }
  const [moving, setMoving] = useState(false)
  const open = offset === -REVEAL && !moving
  const leaveTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])

  // While open, a tap anywhere else closes it (a listener on the page: outside React).
  useEffect(() => {
    if (!open) return
    const close = (e: globalThis.PointerEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) {
        live.current = 0
        setOffsetState(0)
      }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    // A touch drag ends without a click, so the last drag's flag is cleared here.
    dragged.current = false
    drag.current = { x: e.clientX, y: e.clientY, from: live.current, axis: null }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    // The mouse button was let go somewhere else: that drag is over.
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      drag.current = null
      return
    }
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (d.axis === null) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
      d.axis = Math.abs(dx) > Math.abs(dy) * SIDEWAYS ? 'x' : 'y'
      if (d.axis === 'x') {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        dragged.current = true
        setMoving(true)
      }
    }
    // Left stops a little past the Delete button; right follows the finger.
    if (d.axis === 'x') setOffset(Math.max(d.from + dx, -REVEAL * 1.25))
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (d?.axis !== 'x') return
    setMoving(false)
    const x = live.current
    const width = e.currentTarget.getBoundingClientRect().width
    if (x > width * DONE_AT) {
      setOffset(width) // slides out, then it's done
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      leaveTimer.current = window.setTimeout(onDone, reduced ? 0 : LEAVE_MS)
    } else {
      setOffset(x < -REVEAL / 2 ? -REVEAL : 0)
    }
  }

  // The phone took the touch away (a call, Control Center): never Done or Delete, just go back.
  const onPointerCancel = () => {
    const d = drag.current
    drag.current = null
    if (d?.axis !== 'x') return
    setMoving(false)
    setOffset(d.from)
  }

  return (
    <div ref={ref} className="relative">
      {offset !== 0 ? (
        <div className={underneath({ side: offset > 0 ? 'done' : 'delete' })}>
          {offset > 0 ? (
            <span aria-hidden="true" className="flex items-center gap-1.5">
              <Check size={18} strokeWidth={2.5} />
              Done
            </span>
          ) : (
            <Button
              aria-label={`Delete ${label}`}
              // Only reachable once the row is fully open.
              disabled={!open}
              onClick={onDelete}
              className="flex h-full w-22 cursor-pointer flex-col items-center justify-center gap-1 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-on-solid"
            >
              <Trash2 aria-hidden="true" size={18} strokeWidth={2} />
              Delete
            </Button>
          )}
        </div>
      ) : null}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        // After a drag, or on an open row, a tap closes the row instead of opening the reminder.
        onClickCapture={(e) => {
          if (dragged.current || open) {
            e.preventDefault()
            e.stopPropagation()
            dragged.current = false
            if (open) setOffset(0)
          }
        }}
        // The browser's own link drag (desktop) would cancel the swipe.
        onDragStart={(e) => e.preventDefault()}
        style={{ transform: `translateX(${offset}px)` }}
        className={slide({ motion: moving ? 'dragging' : offset > 0 ? 'leaving' : 'snapping' })}
      >
        {children}
      </div>
    </div>
  )
}
