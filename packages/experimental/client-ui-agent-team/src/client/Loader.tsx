/**
 * Loading indicator for Team states that are waiting on the host.
 *
 * Adapted from prompt-kit's Loader (https://www.prompt-kit.com/docs/loader) into
 * this codebase's idiom: CSS modules and theme tokens rather than Tailwind
 * utilities, and caller-supplied localized text rather than literals. The
 * original ships twelve variants; only the two this surface renders are carried
 * over, because a variant with no consumer here would be an unowned public
 * choice. Add the next one when a surface actually needs it.
 */
import type { ReactNode } from 'react'
import css from './Loader.module.css'

/** Loader props; `text` is already localized by the caller. */
export interface LoaderProps {
  /** `dots` for an indeterminate wait, `typing` for a peer that is composing. */
  variant?: 'dots' | 'typing'
  /** Localized label rendered beside the animation. */
  text?: string
  /** Extra class for the caller's own type styling. */
  className?: string
}

/**
 * Render one loading indicator.
 * @param props - variant, localized label, and class.
 * @returns the indicator, labelled for assistive technology by its own text.
 */
export function Loader({ variant = 'dots', text, className }: LoaderProps): ReactNode {
  return (
    <span
      className={className === undefined ? css.loader : `${css.loader} ${className}`}
      role="status"
      data-loader={variant}
    >
      {text !== undefined && <span className={css.label}>{text}</span>}
      <span className={css.track} aria-hidden="true">
        <span className={css.dot} />
        <span className={css.dot} />
        <span className={css.dot} />
      </span>
    </span>
  )
}
