/**
 * Animated shimmer for text that stands for work in progress.
 *
 * Adapted from prompt-kit's TextShimmer (https://www.prompt-kit.com/docs/text-shimmer)
 * into this codebase's idiom: CSS modules and theme tokens rather than Tailwind
 * utilities, and copy supplied by the caller from a locale dictionary rather
 * than literals. The `duration` and `spread` contract follows the original —
 * `spread` widens the highlight in proportion to the text length, so a short
 * label and a long one sweep at the same apparent speed.
 */
import type { CSSProperties, ReactNode } from 'react'
import css from './TextShimmer.module.css'

/** Shimmer props; `children` is text because the sweep is measured from its length. */
export interface TextShimmerProps {
  /** Text to sweep. */
  children: string
  /** Element to render (inline by default). */
  as?: 'span' | 'div' | 'p'
  /** Seconds for one sweep. */
  duration?: number
  /** Highlight width in character widths, clamped to the original's 5..45. */
  spread?: number
  /** Extra class for the caller's own type styling. */
  className?: string
}

const SPREAD_MIN = 5
const SPREAD_MAX = 45

/**
 * Render one line of shimmering text.
 * @param props - text, element, sweep duration, highlight spread, and class.
 * @returns the shimmering element.
 */
export function TextShimmer({
  children,
  as: Component = 'span',
  duration = 4,
  spread = 20,
  className,
}: TextShimmerProps): ReactNode {
  const clamped = Math.min(SPREAD_MAX, Math.max(SPREAD_MIN, spread))
  const style = {
    '--dsh-shimmer-duration': `${String(duration)}s`,
    '--dsh-shimmer-spread': `${String(children.length * clamped)}px`,
  } as CSSProperties
  return (
    <Component className={className === undefined ? css.shimmer : `${css.shimmer} ${className}`} style={style}>
      {children}
    </Component>
  )
}
