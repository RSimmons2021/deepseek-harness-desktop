// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { zh } from '../src/client/locale.ts'
import { AssistantMarkdown, type AssistantMarkdownProps } from '../src/client/chat/AssistantMarkdown.tsx'

let nextAnimationFrameId = 1
let animationFrames = new Map<number, FrameRequestCallback>()

function flushAnimationFrames(count: number): void {
  for (let index = 0; index < count; index += 1) {
    const callbacks = [...animationFrames.values()]
    animationFrames.clear()
    for (const callback of callbacks) callback(index)
  }
}

beforeEach(() => {
  nextAnimationFrameId = 1
  animationFrames = new Map()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextAnimationFrameId
    nextAnimationFrameId += 1
    animationFrames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    animationFrames.delete(id)
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const t = makeTranslate(zh, commonZh)
const renderMessageImages: AssistantMarkdownProps['renderMessageImages'] = () => null

describe('ReasoningRow', () => {
  it('follows the latest streaming line, scrolls to its end, then restores the settled first line', () => {
    const view = render(
      <AssistantMarkdown reasoningView="collapsed"
        t={t}
        blocks={[{ kind: 'reasoning', text: 'Inspect the session\nNewest reasoning tokens' }]}
        streaming
        renderMessageImages={renderMessageImages}
      />,
    )
    expect(view.getByText('运行中')).toBeTruthy()
    const summary = view.getByText('Newest reasoning tokens')
    Object.defineProperties(summary, {
      scrollWidth: { configurable: true, value: 300 },
      clientWidth: { configurable: true, value: 100 },
    })

    view.rerender(
      <AssistantMarkdown reasoningView="collapsed"
        t={t}
        blocks={[{ kind: 'reasoning', text: 'Inspect the session\nNewest reasoning tokens keep arriving' }]}
        streaming
        renderMessageImages={renderMessageImages}
      />,
    )
    expect(summary.scrollLeft).toBe(0)
    flushAnimationFrames(2)
    expect(summary.scrollLeft).toBe(0)
    flushAnimationFrames(1)
    expect(summary.scrollLeft).toBe(200)
    expect(summary.getAttribute('data-follow-end')).toBe('true')

    view.rerender(
      <AssistantMarkdown reasoningView="collapsed"
        t={t}
        blocks={[{ kind: 'reasoning', text: 'Inspect the session\nNewest reasoning tokens keep arriving\n' }]}
        streaming={false}
        renderMessageImages={renderMessageImages}
      />,
    )
    flushAnimationFrames(3)
    expect(view.getByText('Inspect the session')).toBeTruthy()
    expect(view.queryByText('运行中')).toBeNull()
    expect(summary.scrollLeft).toBe(0)
    expect(summary.hasAttribute('data-follow-end')).toBe(false)
  })

  it('expands from either Think or the reasoning summary', () => {
    const view = render(
      <AssistantMarkdown reasoningView="collapsed"
        t={t}
        blocks={[{ kind: 'reasoning', text: 'Inspect the session\nCheck persistence' }]}
        streaming={false}
        renderMessageImages={renderMessageImages}
      />,
    )
    const row = view.getByRole('button')

    fireEvent.click(view.getByText('Inspect the session'))
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(view.getByText(/Check persistence/)).toBeTruthy()

    fireEvent.click(view.getByText('思考'))
    expect(row.getAttribute('aria-expanded')).toBe('false')
  })

  it('expanded Think drops the inline summary and renders plain prose, no IN card', () => {
    const view = render(
      <AssistantMarkdown reasoningView="collapsed"
        t={t}
        blocks={[{ kind: 'reasoning', text: 'Inspect the session\nCheck persistence' }]}
        streaming={false}
        renderMessageImages={renderMessageImages}
      />,
    )
    fireEvent.click(view.getByText('思考'))
    expect(view.getAllByText(/Inspect the session/)).toHaveLength(1)
    expect(view.queryByText('IN')).toBeNull()
    expect(view.container.querySelector('[class*="ioCard"]')).toBeNull()
    expect(view.container.querySelector('[class*="thinkBody"]')).not.toBeNull()
  })
})

describe('ReasoningRow presentation preference', () => {
  /** The Think body, present only while the row is open. */
  function body(container: HTMLElement): HTMLElement | null {
    return container.querySelector('[data-following], [class*="thinkBody"]')
  }

  it('opens the row while the model is still thinking, and shuts it when it stops', () => {
    const view = render(
      <AssistantMarkdown
        reasoningView="streaming"
        blocks={[{ kind: 'reasoning', text: 'first\nsecond' }]}
        streaming
        renderMessageImages={renderMessageImages}
        t={t}
      />,
    )
    // Watching it think is the whole point of this mode.
    expect(body(view.container)?.textContent).toBe('first\nsecond')

    view.rerender(
      <AssistantMarkdown
        reasoningView="streaming"
        blocks={[{ kind: 'reasoning', text: 'first\nsecond' }]}
        streaming={false}
        renderMessageImages={renderMessageImages}
        t={t}
      />,
    )
    // A settled transcript stays scannable; the summary line is still there.
    expect(body(view.container)).toBeNull()
    expect(view.container.textContent).toContain('first')
  })

  it('keeps every block open under Always open, and shut under Summary only', () => {
    const blocks = [{ kind: 'reasoning' as const, text: 'thinking about it' }]
    const expanded = render(
      <AssistantMarkdown reasoningView="expanded" blocks={blocks} streaming={false} renderMessageImages={renderMessageImages} t={t} />,
    )
    expect(body(expanded.container)?.textContent).toBe('thinking about it')
    cleanup()

    const collapsed = render(
      <AssistantMarkdown reasoningView="collapsed" blocks={blocks} streaming={false} renderMessageImages={renderMessageImages} t={t} />,
    )
    expect(body(collapsed.container)).toBeNull()
  })

  it('lets a click win over the preference, and forgets it once the thinking is over', () => {
    const blocks = [{ kind: 'reasoning' as const, text: 'why this way' }]
    const view = render(
      <AssistantMarkdown reasoningView="collapsed" blocks={blocks} streaming renderMessageImages={renderMessageImages} t={t} />,
    )
    expect(body(view.container)).toBeNull()

    // Summary only says shut; the reader says open. The reader wins.
    fireEvent.click(view.getByText(zh['message.think']))
    expect(body(view.container)?.textContent).toBe('why this way')

    // Once the block stops running the row goes back to the preference, so one
    // deliberate peek does not pin a block open for the rest of the transcript.
    view.rerender(
      <AssistantMarkdown reasoningView="collapsed" blocks={blocks} streaming={false} renderMessageImages={renderMessageImages} t={t} />,
    )
    expect(body(view.container)).toBeNull()
  })

  it('follows its own tail while the body is open and still arriving', () => {
    const scrolled: number[] = []
    const view = render(
      <AssistantMarkdown
        reasoningView="streaming"
        blocks={[{ kind: 'reasoning', text: 'one' }]}
        streaming
        renderMessageImages={renderMessageImages}
        t={t}
      />,
    )
    const element = body(view.container)
    if (element === null) throw new Error('the body did not open')
    Object.defineProperty(element, 'scrollHeight', { value: 900, configurable: true })
    Object.defineProperty(element, 'scrollTop', {
      configurable: true,
      get: () => 0,
      set: (value: number) => { scrolled.push(value) },
    })

    view.rerender(
      <AssistantMarkdown
        reasoningView="streaming"
        blocks={[{ kind: 'reasoning', text: 'one\ntwo\nthree' }]}
        streaming
        renderMessageImages={renderMessageImages}
        t={t}
      />,
    )
    // The scheduler coalesces over three frames before it touches the DOM.
    flushAnimationFrames(6)
    // The newest sentence is the one on screen, rather than the one the reader
    // would have to scroll down to find.
    expect(scrolled).toContain(900)
  })
})
