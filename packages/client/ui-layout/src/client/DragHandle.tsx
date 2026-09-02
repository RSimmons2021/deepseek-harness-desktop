/**
 * One column-resize handle, shared by both frames.
 *
 * Pointer capture keeps the gesture with the strip once it starts, and each
 * move is reported at most once per frame as a delta against the position the
 * gesture started from, so the caller can hold a frozen base width and never
 * compound its own writes.
 */
import { useCallback, useRef, useState } from 'react'
import css from './DragHandle.module.css'

/** Which seam a handle sits on; keys the hover-reveal CSS to the owning column. */
export type DragSide = 'sidebar' | 'details' | 'workspace' | 'conversation'

/** One handle: the seam it names, its position, and the gesture callbacks. */
export interface DragHandleProps {
  /** Seam this handle straddles. */
  side: DragSide
  /** Distance from the frame's left edge to the column border, in px. */
  left: number
  /** Localized description of what this handle resizes. */
  label: string
  /** Called once when the gesture starts, before any delta. */
  onStart: () => void
  /** Called with the signed distance from the gesture's starting position. */
  onDrag: (dx: number) => void
  /** Called once when the gesture ends, after the final delta. */
  onEnd: () => void
}

/**
 * Render one resize handle.
 * @param props - the seam, its position, its label, and the gesture callbacks.
 * @returns the hit strip, positioned on the column border.
 */
export function DragHandle(props: DragHandleProps) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}
