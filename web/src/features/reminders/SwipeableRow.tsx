import { cva } from 'class-variance-authority'
import { Check, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'

/** A drag shorter than this (px) is still a tap. */
const SLOP = 8
/** Sideways only when clearly more sideways than down: a slanted scroll stays a scroll. */
const SIDEWAYS = 1.5
/** Swipe past this share of the row's width, either way, to commit (Inventory → Motion 2). */
const COMMIT_AT = 0.4
/** How long the row takes to slide out (--duration-base); snapping back uses --duration-fast. */
const LEAVE_MS = 220

type Side = 'done' | 'delete'
type Motion = 'dragging' | 'snapping' | 'leaving'

/** What shows under the row while it moves: green Done (right) or red Delete (left). */
const underneath = cva(
  'absolute inset-0 flex items-center overflow-hidden rounded-md px-4 text-sm font-semibold',
  {
    variants: {
      side: {
        done: 'bg-tag-done text-tag-done-fg',
        delete: 'justify-end bg-error text-on-solid',
      } satisfies Record<Side, string>,
    },
  },
)

/** The row follows the finger while dragged; it snaps back fast and slides out slower. */
const slide = cva('relative touch-pan-y motion-reduce:transition-none', {
  variants: {
    motion: {
      dragging: '',
      snapping: 'transition-transform duration-(--duration-fast) ease-(--easing-std)',
      leaving: 'transition-transform duration-(--duration-base) ease-(--easing-std)',
    } satisfies Record<Motion, string>,
  },
})

type Drag = { x: number; y: number; axis: 'x' | 'y' | null }

/**
 * A reminder row you can swipe, the same both ways: past 40% of its width the row slides out
 * and the action happens. Right: Done. Left: Delete (owner decisions 2026-10-20: no extra tap;
 * every row, done ones too, which only swipe left).
 * A shorter swipe snaps back. Hand-built: Base UI has no swipeable list item. Vertical drags
 * stay page scrolls (touch-action: pan-y). Without swiping (keyboard, screen readers), the row
 * is still a link to the reminder page, which has Done and Delete.
 * Design Inventory → Motion 2 "Swipe row gesture"; Inspiration "Swipe gestures on list rows".
 */
export function SwipeableRow({
  onDone,
  onDelete,
  children,
}: {
  /** Swipe right: Done. Left out (done reminders): the row doesn't move right. */
  onDone?: () => void
  onDelete: () => void
  children: ReactNode
}) {
  const drag = useRef<Drag | null>(null)
  // A drag just ended: the click a mouse sends next must not open the reminder.
  const dragged = useRef(false)
  // The live position (read in the handlers) and its copy in state (for drawing).
  const live = useRef(0)
  const [offset, setOffsetState] = useState(0)
  const setOffset = (x: number) => {
    live.current = x
    setOffsetState(x)
  }
  const [moving, setMoving] = useState(false)
  const leaveTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    // A touch drag ends without a click, so the last drag's flag is cleared here.
    dragged.current = false
    drag.current = { x: e.clientX, y: e.clientY, axis: null }
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
    if (d.axis === 'x') setOffset(onDone ? dx : Math.min(dx, 0))
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (d?.axis !== 'x') return
    setMoving(false)
    const x = live.current
    const width = e.currentTarget.getBoundingClientRect().width
    if (Math.abs(x) < width * COMMIT_AT) {
      setOffset(0)
      return
    }
    // Slides out the way it was swiped, then the action happens.
    setOffset(x > 0 ? width : -width)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const action = x > 0 ? onDone : onDelete
    if (action) leaveTimer.current = window.setTimeout(action, reduced ? 0 : LEAVE_MS)
  }

  // The phone took the touch away (a call, Control Center): never Done or Delete, just go back.
  const onPointerCancel = () => {
    const d = drag.current
    drag.current = null
    if (d?.axis !== 'x') return
    setMoving(false)
    setOffset(0)
  }

  return (
    <div className="relative">
      {offset !== 0 ? (
        <div aria-hidden="true" className={underneath({ side: offset > 0 ? 'done' : 'delete' })}>
          {offset > 0 ? (
            <span className="flex items-center gap-1.5">
              <Check size={18} strokeWidth={2.5} />
              Done
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              Delete
              <Trash2 size={18} strokeWidth={2} />
            </span>
          )}
        </div>
      ) : null}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        // The click a mouse sends at the end of its drag: swallow it, so it doesn't open the reminder.
        onClickCapture={(e) => {
          if (!dragged.current) return
          e.preventDefault()
          e.stopPropagation()
          dragged.current = false
        }}
        // The browser's own link drag (desktop) would cancel the swipe.
        onDragStart={(e) => e.preventDefault()}
        style={{ transform: `translateX(${offset}px)` }}
        className={slide({ motion: moving ? 'dragging' : offset !== 0 ? 'leaving' : 'snapping' })}
      >
        {children}
      </div>
    </div>
  )
}
