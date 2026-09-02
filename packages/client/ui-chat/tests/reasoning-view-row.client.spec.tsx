// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionPendingInteractionSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ReasoningViewMode } from '../src/chat-settings.ts'
import { ReasoningViewRow, type ReasoningViewRowProps } from '../src/client/settings/ReasoningViewRow.tsx'
import { en } from '../src/client/locale.ts'

afterEach(cleanup)

function mount(mode: ReasoningViewMode = 'streaming') {
  const source = createSnapshotStore(mode)
  const setReasoningView = vi.fn((next: ReasoningViewMode) => { source.set(next) })
  const props: ReasoningViewRowProps = {
    useSessions: bindSnapshotSelector(createSnapshotStore<SessionListState>({
      ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })),
    useSessionPendingInteraction: bindSnapshotSelector(createSnapshotStore<SessionPendingInteractionSnapshot>(new Map())),
    useWorkspaces: bindSnapshotSelector(createSnapshotStore<WorkspaceSnapshot>({
      items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    })),
    useReasoningView: bindSnapshotSelector(source),
    setReasoningView,
    t: makeTranslate(en),
  }
  render(<ReasoningViewRow {...props} />)
  return { setReasoningView }
}

describe('ReasoningViewRow', () => {
  it('explains the preference and shows the shipped default', () => {
    mount()
    expect(screen.getByText('Model reasoning')).toBeDefined()
    expect(screen.getByText('How much of the model’s thinking the transcript shows')).toBeDefined()
    expect(screen.getByRole('button', { name: /While it thinks/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('offers all three presentations and reports the chosen one', () => {
    const row = mount()
    fireEvent.click(screen.getByRole('button', { name: /While it thinks/ }))
    expect(screen.getAllByRole('menuitem').map(item => item.textContent))
      .toEqual(['Summary only', 'While it thinks', 'Always open'])

    fireEvent.click(screen.getByRole('menuitem', { name: 'Always open' }))
    expect(row.setReasoningView).toHaveBeenCalledWith('expanded')
    // The trigger follows the mirrored value, and the menu closes on dismissal.
    const trigger = screen.getByRole('button', { name: /Always open/ })
    fireEvent.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'Summary only' })).toBeDefined()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menuitem', { name: 'Summary only' })).toBeNull()
  })
})
