/**
 * Return-to-latest control for the transcript.
 *
 * Adapted from prompt-kit's ScrollButton
 * (https://www.prompt-kit.com/docs/scroll-button) into this codebase's idiom:
 * CSS modules and theme tokens rather than Tailwind utilities, and a localized
 * label rather than a literal. It watches the scroll container it is given and
 * shows itself only once the reader has left the floor, so a pinned transcript
 * carries no extra chrome.
 */
import { useEffect, useState } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationSlotProps } from '../contract/slots.ts'
import css from './ScrollButton.module.css'

/** Distance from the floor still treated as pinned, in px. */
const FLOOR_SLACK = 64

/** Smooth scrolling is decorative, so reduced-motion readers jump directly. */
function scrollBehavior(): ScrollBehavior {
  // jsdom has no matchMedia despite lib.dom's non-optional declaration.
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/** Scroll-button props: the scroller to follow and the localizer. */
export interface ScrollButtonProps {
  /** Scroll container to watch and return to the end of. */
  scroller: HTMLElement | null
  /** Conversation-namespace localizer. */
  t: ConversationSlotProps['t']
}

/**
 * Render the return-to-latest control while the transcript is scrolled away.
 * @param props - the scroll container and the localizer.
 * @returns the control, or nothing while the transcript sits at its floor.
 */
export function ScrollButton({ scroller, t }: ScrollButtonProps) {
  const [away, setAway] = useState(false)

  useEffect(() => {
    if (scroller === null) return
    const read = (): void => {
      setAway(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > FLOOR_SLACK)
    }
    read()
    scroller.addEventListener('scroll', read, { passive: true })
    // Content growing while the reader is away changes the distance without a
    // scroll event, so the container's own size is watched too.
    const observer = new ResizeObserver(read)
    observer.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', read)
      observer.disconnect()
    }
  }, [scroller])

  if (!away || scroller === null) return null
  return (
    <button
      type="button"
      className={css.button}
      aria-label={t('scrollToLatest')}
      title={t('scrollToLatest')}
      onClick={() => { scroller.scrollTo({ top: scroller.scrollHeight, behavior: scrollBehavior() }) }}
    >
      <IconChevronDownOutline14 />
    </button>
  )
}
