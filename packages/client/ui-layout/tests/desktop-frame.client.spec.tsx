// @vitest-environment jsdom
/**
 * DesktopFrame interaction spec. The desktop window carries four tracks and a
 * handle on every seam between two of them, so what is asserted here is that a
 * drag moves the seam it names, that a seam with nothing on one side of it is
 * not offered, and that the concession chain reaches the rendered tracks. jsdom
 * has no layout engine, so the frame width comes from a mocked
 * getBoundingClientRect and resizes are driven through the ResizeObserver stub.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { DesktopFrame } from '@deepseek-ai/dsh-client-ui-layout/src/client/DesktopFrame.tsx'
import type { DesktopFrameProps } from '@deepseek-ai/dsh-client-ui-layout/src/client/DesktopFrame.tsx'
import {
  CONVERSATION_DEFAULT, CONVERSATION_MAX, SIDEBAR_COLLAPSED, SIDEBAR_DEFAULT,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/columns.ts'
import { createLayoutStore } from '@deepseek-ai/dsh-client-ui-layout/src/client/stores.ts'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

const sessionBlank = { current: false }

const SessionProviderStub: DesktopFrameProps['SessionProvider'] = ({ children }) => <>{children}</>

/** Observer stub: captures the callback so tests can fire resizes manually. */
let fireResize: (() => void) | null = null
class ResizeObserverStub {
  #cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) { this.#cb = cb }
  observe(): void { fireResize = () => { this.#cb([], this) } }
  unobserve(): void {}
  disconnect(): void { fireResize = null }
}

let frameWidth = 1920

/** Test-local selector hook over a framework-neutral store instance. */
function hookOf<T>(inst: { subscribe: (fn: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(sel: (s: T) => S): S { return sel(useSyncExternalStore(inst.subscribe, inst.getSnapshot)) }
}

function mountFrame() {
  window.innerWidth = frameWidth
  const instance = createLayoutStore().create()
  const renderSlot = ((key: string) => <div data-testid={`${key}-content`} />) as DesktopFrameProps['renderSlot']
  const useSessions = ((sel: (s: SessionListState) => unknown) => sel({
    ids: ['s-test'],
    byId: { 's-test': { id: 's-test', displayTitle: 'Test', running: false, blank: sessionBlank.current, updatedAt: 1 } },
    current: 's-test' as SessionId,
    phase: 'ready',
  } as unknown as SessionListState)) as never
  const element = () => (
    <DesktopFrame
      useStore={hookOf(instance)}
      actions={instance.actions}
      renderSlot={renderSlot}
      useSessions={useSessions}
      SessionProvider={SessionProviderStub}
      useSessionPendingInteraction={((selector: (s: unknown) => unknown) => selector(new Map())) as never}
      useWorkspaces={((selector: (s: unknown) => unknown) => selector({
        items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
      })) as never}
      t={key => key}
    />
  )
  const utils = render(element())
  const frame = utils.container.firstElementChild as HTMLElement
  return { instance, frame, ...utils }
}

/** The four resolved tracks the frame wrote inline, named rather than indexed. */
function tracks(frame: HTMLElement): { sidebar: number; workspace: number; conversation: number; details: number } {
  const [sidebar, workspace, conversation, details] =
    frame.style.gridTemplateColumns.split(' ').map(part => Number(part.replace('px', '')))
  if (sidebar === undefined || workspace === undefined || conversation === undefined || details === undefined
    || [sidebar, workspace, conversation, details].some(Number.isNaN)) {
    throw new Error(`unexpected template: ${frame.style.gridTemplateColumns}`)
  }
  return { sidebar, workspace, conversation, details }
}

/** Total of the four tracks, which must always be the whole window. */
function total(t: ReturnType<typeof tracks>): number {
  return t.sidebar + t.workspace + t.conversation + t.details
}

function handle(frame: HTMLElement, side: string): Element {
  const found = frame.querySelector(`[data-side="${side}"]`)
  if (found === null) throw new Error(`no ${side} handle`)
  return found
}

function drag(target: Element, fromX: number, toX: number): void {
  act(() => { target.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: fromX, bubbles: true })) })
  act(() => {
    target.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: toX, bubbles: true }))
    vi.advanceTimersByTime(20)
  })
  act(() => { target.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: toX, bubbles: true })) })
}

beforeEach(() => {
  frameWidth = 1920
  sessionBlank.current = false
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => { cb(0) }, 16) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (h: number) => { clearTimeout(h) })
  window.innerWidth = frameWidth
  Element.prototype.getBoundingClientRect = function () {
    return { width: frameWidth, height: 1080, top: 0, left: 0, right: frameWidth, bottom: 1080, x: 0, y: 0, toJSON: () => ({}) }
  }
  const captured = new WeakSet<Element>()
  Element.prototype.setPointerCapture = function () { captured.add(this) }
  Element.prototype.releasePointerCapture = function () { captured.delete(this) }
  Element.prototype.hasPointerCapture = function () { return captured.has(this) }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('DesktopFrame', () => {
  it('lays the window out as four tracks with the workspace taking the remainder', () => {
    const { frame } = mountFrame()
    expect(tracks(frame)).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      workspace: frameWidth - SIDEBAR_DEFAULT - CONVERSATION_DEFAULT,
      conversation: CONVERSATION_DEFAULT,
      details: 0,
    })
  })

  it('moves the seam a handle names, and leaves the others where they were', () => {
    const { frame } = mountFrame()
    const before = tracks(frame)

    drag(handle(frame, 'sidebar'), SIDEBAR_DEFAULT, SIDEBAR_DEFAULT + 60)
    const afterSidebar = tracks(frame)
    expect(afterSidebar.sidebar).toBe(SIDEBAR_DEFAULT + 60)
    expect(afterSidebar.conversation).toBe(before.conversation)
    // The workspace absorbs what the sidebar took, so the window still fills.
    expect(total(afterSidebar)).toBe(frameWidth)

    // Dragging the workspace seam right widens the workspace at the
    // conversation's expense: one seam, two columns, opposite signs.
    const seam = afterSidebar.sidebar + afterSidebar.workspace
    drag(handle(frame, 'workspace'), seam, seam + 80)
    const afterWorkspace = tracks(frame)
    expect(afterWorkspace.workspace).toBe(afterSidebar.workspace + 80)
    expect(afterWorkspace.conversation).toBe(CONVERSATION_DEFAULT - 80)
    expect(afterWorkspace.sidebar).toBe(afterSidebar.sidebar)
  })

  it('clamps a seam at the column’s own range rather than following the pointer out of it', () => {
    const { frame } = mountFrame()
    const seam = SIDEBAR_DEFAULT + (frameWidth - SIDEBAR_DEFAULT - CONVERSATION_DEFAULT)
    drag(handle(frame, 'workspace'), seam, seam - 5000)
    expect(tracks(frame).conversation).toBe(CONVERSATION_MAX)
  })

  it('offers no seam where a column has nothing on the other side of it', () => {
    const { frame, instance } = mountFrame()
    // Details is closed at rest, so its seam is not there to grab.
    expect(frame.querySelector('[data-side="details"]')).toBeNull()
    act(() => { instance.actions.openDetails() })
    expect(frame.querySelector('[data-side="details"]')).not.toBeNull()

    // A collapsed sidebar is a fixed rail: nothing to resize.
    act(() => { instance.actions.toggleSidebar() })
    expect(tracks(frame).sidebar).toBe(SIDEBAR_COLLAPSED)
    expect(frame.querySelector('[data-side="sidebar"]')).toBeNull()
  })

  it('hands the window to the conversation while the Session is blank', () => {
    sessionBlank.current = true
    const { frame } = mountFrame()
    // Nothing has happened yet, so the workspace could only show an inert
    // roster; the conversation carries the picker and the composer instead.
    // Closing the conversation here would strand the reader: the composer that
    // ends the blank state is inside it.
    expect(tracks(frame).workspace).toBe(0)
    expect(tracks(frame).conversation).toBe(frameWidth - SIDEBAR_DEFAULT)
    expect(frame.querySelector('[data-side="workspace"]')).toBeNull()
  })

  it('re-solves against the frame’s own box when the window resizes', () => {
    const { frame } = mountFrame()
    expect(tracks(frame).workspace).toBe(frameWidth - SIDEBAR_DEFAULT - CONVERSATION_DEFAULT)
    frameWidth = 1400
    act(() => { fireResize?.(); vi.advanceTimersByTime(20) })
    expect(tracks(frame).workspace).toBe(1400 - SIDEBAR_DEFAULT - CONVERSATION_DEFAULT)
  })
})
