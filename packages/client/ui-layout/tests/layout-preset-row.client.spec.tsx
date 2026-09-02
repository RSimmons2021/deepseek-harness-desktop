// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionPendingInteractionSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import type { LayoutPresetId } from '@deepseek-ai/dsh-client-ui-layout/src/layout-settings.ts'
import {
  LayoutPresetRow, type LayoutPresetRowProps,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/settings/LayoutPresetRow.tsx'

afterEach(cleanup)

function mount(preset: LayoutPresetId = 'balanced') {
  const source = createSnapshotStore(preset)
  const setLayoutPreset = vi.fn((next: LayoutPresetId) => { source.set(next) })
  const props: LayoutPresetRowProps = {
    useSessions: bindSnapshotSelector(createSnapshotStore<SessionListState>({
      ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })),
    useSessionPendingInteraction: bindSnapshotSelector(createSnapshotStore<SessionPendingInteractionSnapshot>(new Map())),
    useWorkspaces: bindSnapshotSelector(createSnapshotStore<WorkspaceSnapshot>({
      items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    })),
    useLayoutPreset: bindSnapshotSelector(source),
    setLayoutPreset,
    t: makeTranslate(en),
  }
  render(<LayoutPresetRow {...props} />)
  return { setLayoutPreset }
}

describe('LayoutPresetRow', () => {
  it('explains that the arrangement is a starting point, not a mode', () => {
    mount()
    expect(screen.getByText('Window layout')).toBeDefined()
    expect(screen.getByText('Where the window starts; the columns stay draggable')).toBeDefined()
    expect(screen.getByRole('button', { name: /Balanced/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('offers every arrangement and reports the chosen one', () => {
    const row = mount()
    fireEvent.click(screen.getByRole('button', { name: /Balanced/ }))
    expect(screen.getAllByRole('menuitem').map(item => item.textContent))
      .toEqual(['Balanced', 'Workspace first', 'Conversation first', 'Everything open'])

    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspace first' }))
    expect(row.setLayoutPreset).toHaveBeenCalledWith('workspace')
    // The trigger follows the mirrored value, and the menu closes on dismissal.
    const trigger = screen.getByRole('button', { name: /Workspace first/ })
    fireEvent.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'Balanced' })).toBeDefined()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menuitem', { name: 'Balanced' })).toBeNull()
  })
})
