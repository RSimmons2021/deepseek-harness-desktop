// @vitest-environment jsdom

/** Behaviour of the two prompt-kit components adapted for the conversation column. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PromptSuggestion } from '../src/client/skeleton/PromptSuggestion.tsx'
import { ScrollButton } from '../src/client/skeleton/ScrollButton.tsx'

/** jsdom has no ResizeObserver; ScrollButton watches the scrollport through one. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => { vi.stubGlobal('ResizeObserver', ResizeObserverStub) })
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const t = ((key: string) => key) as never

describe('PromptSuggestion', () => {
  it('seeds the draft with the chip it was given rather than sending it', () => {
    const setDraft = vi.fn()
    render(<PromptSuggestion t={t} setDraft={setDraft} />)
    const chips = screen.getAllByRole('button')
    expect(chips).toHaveLength(4)
    fireEvent.click(chips[1]!)
    expect(setDraft).toHaveBeenCalledExactlyOnceWith('suggestion.findBug')
  })

  it('renders nothing while no Session can accept a draft', () => {
    const { container } = render(<PromptSuggestion t={t} setDraft={undefined} />)
    expect(container.firstChild).toBeNull()
  })
})

/** Build a scroller whose geometry the component reads. */
function scrollerAt(distanceFromFloor: number): HTMLDivElement {
  const el = document.createElement('div')
  Object.defineProperties(el, {
    scrollHeight: { value: 1000, configurable: true },
    clientHeight: { value: 400, configurable: true },
    scrollTop: { value: 600 - distanceFromFloor, configurable: true, writable: true },
  })
  el.scrollTo = vi.fn() as never
  document.body.append(el)
  return el
}

describe('ScrollButton', () => {
  it('stays hidden while the transcript sits at its floor', () => {
    render(<ScrollButton scroller={scrollerAt(0)} t={t} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('appears once the reader leaves the floor and returns the scroller to the end', () => {
    const scroller = scrollerAt(500)
    const scrollTo = vi.mocked(scroller.scrollTo)
    render(<ScrollButton scroller={scroller} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'scrollToLatest' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' })
  })

  it('jumps to the end when the reader prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const scroller = scrollerAt(500)
    const scrollTo = vi.mocked(scroller.scrollTo)
    render(<ScrollButton scroller={scroller} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'scrollToLatest' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'auto' })
  })

  it('renders nothing without a scroll container', () => {
    const { container } = render(<ScrollButton scroller={null} t={t} />)
    expect(container.firstChild).toBeNull()
  })
})
