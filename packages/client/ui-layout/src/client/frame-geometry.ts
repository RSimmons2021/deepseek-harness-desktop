/**
 * Frame geometry both shells share: the measured width they solve against, and
 * the bookkeeping a column-resize gesture needs.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { DragHandleProps } from './DragHandle.tsx'

/** The gesture callbacks one seam hands its handle. */
export type SeamGesture = Pick<DragHandleProps, 'onStart' | 'onDrag' | 'onEnd'>

/** Which way a column grows when its seam moves right. */
export type SeamGrowth = 'right' | 'left'

/**
 * Track the frame's own box, rather than the window's.
 *
 * A column drag and a window resize both change the room the solver has, and
 * only the frame's box sees both. Reads are throttled to one per frame.
 * @param ref - the frame element to observe.
 * @returns the frame's current width in px.
 */
export function useFrameWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const el = ref.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return
    let raf: number | null = null
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = null
        const measured = el.getBoundingClientRect().width
        if (measured > 0) setWidth(measured)
      })
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [ref])
  return width
}

/** A frame's seam gestures: whether one is running, and how to bind each seam. */
export interface SeamGestures {
  /** True for the whole gesture, so the frame can stop easing its tracks. */
  readonly dragging: boolean
  /**
   * Bind one seam.
   * @param read - the column's rendered width, read once when the gesture starts.
   * @param write - store the column's new width.
   * @param growth - which way the column grows when the seam moves right.
   * @returns the gesture callbacks for that seam's handle.
   */
  bind: (read: () => number, write: (px: number) => void, growth: SeamGrowth) => SeamGesture
}

/**
 * Hold the state a column-resize gesture needs.
 *
 * One base width serves every seam because only one seam can be dragged at a
 * time. It is the width the column was rendered at when the gesture started —
 * not its stored preference, so grabbing a column the concession chain had
 * already clamped does not make it jump — and it stays frozen for the whole
 * gesture, so deltas never compound.
 * @returns whether a gesture is running, and the seam binder.
 */
export function useSeamGestures(): SeamGestures {
  const base = useRef(0)
  const [dragging, setDragging] = useState(false)
  const bind = useCallback((read: () => number, write: (px: number) => void, growth: SeamGrowth): SeamGesture => ({
    onStart: () => { base.current = read(); setDragging(true) },
    onDrag: (dx: number) => { write(growth === 'right' ? base.current + dx : base.current - dx) },
    onEnd: () => { setDragging(false) },
  }), [])
  return { dragging, bind }
}
