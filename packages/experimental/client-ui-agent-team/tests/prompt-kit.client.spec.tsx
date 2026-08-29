// @vitest-environment jsdom

/** Behaviour of the two prompt-kit components adapted for the Team surface. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Loader } from '../src/client/Loader.tsx'
import { TextShimmer } from '../src/client/TextShimmer.tsx'

afterEach(cleanup)

describe('TextShimmer', () => {
  it('scales the highlight with the text length and keeps the caller element', () => {
    render(<TextShimmer as="div" duration={2}>{'abcd'}</TextShimmer>)
    const el = screen.getByText('abcd')
    expect(el.tagName).toBe('DIV')
    expect(el.style.getPropertyValue('--dsh-shimmer-duration')).toBe('2s')
    // Four characters at the default spread of 20.
    expect(el.style.getPropertyValue('--dsh-shimmer-spread')).toBe('80px')
  })

  it('clamps the spread to the range the original contract allows', () => {
    render(<><TextShimmer spread={200}>{'ab'}</TextShimmer><TextShimmer spread={1}>{'cd'}</TextShimmer></>)
    expect(screen.getByText('ab').style.getPropertyValue('--dsh-shimmer-spread')).toBe('90px')
    expect(screen.getByText('cd').style.getPropertyValue('--dsh-shimmer-spread')).toBe('10px')
  })

  it('defaults to an inline span and appends a caller class', () => {
    render(<TextShimmer className="extra">{'plain'}</TextShimmer>)
    const el = screen.getByText('plain')
    expect(el.tagName).toBe('SPAN')
    expect(el.className).toContain('extra')
  })
})

describe('Loader', () => {
  it('labels itself with the caller-supplied text and reports a status role', () => {
    render(<Loader text="Loading Team" />)
    const status = screen.getByRole('status')
    expect(status.dataset.loader).toBe('dots')
    expect(status.textContent).toBe('Loading Team')
  })

  it('renders the typing variant without text and appends a caller class', () => {
    render(<Loader variant="typing" className="extra" />)
    const status = screen.getByRole('status')
    expect(status.dataset.loader).toBe('typing')
    expect(status.textContent).toBe('')
    expect(status.className).toContain('extra')
  })
})
