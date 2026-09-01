// @vitest-environment jsdom

/**
 * Both Team surfaces under a reduced-motion preference. `useReducedMotion`
 * caches its media-query answer for the whole module registry, so the
 * preference is supplied by the hook rather than by a `matchMedia` stub a
 * later render would already have read past.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TeamView } from '@deepseek-ai/dsh-experimental-agent-team/client'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { DesktopTeamRoot, type DesktopTeamRootProps } from '../src/client/DesktopTeamRoot.tsx'
import { TeamAction, type TeamSurfaceProps } from '../src/client/TeamAction.tsx'
import { zh } from '../src/client/locales.ts'

vi.mock('motion/react', async importOriginal => ({
  ...await importOriginal<typeof import('motion/react')>(),
  useReducedMotion: () => true,
}))

afterEach(cleanup)

const SESSION = 'lead' as SessionId
const WORKER = 'worker-id' as SessionId
const view: TeamView = {
  members: [
    { id: SESSION, name: 'lead', role: 'lead', status: 'idle', pendingMessages: 0, diagnostics: [] },
    { id: WORKER, name: 'worker', role: 'teammate', status: 'idle', pendingMessages: 0, diagnostics: [] },
  ],
  tasks: [{
    id: 'task-1' as never,
    revision: 1,
    subject: 'Implement runtime',
    description: 'Build the Team runtime',
    status: 'in_progress',
    ownerName: 'worker',
    blockedBy: [],
    writeScopes: ['src'],
    ready: true,
    writeScopeWarnings: ['write scopes overlap with task-2'],
  }],
  capacity: 4,
}

function props(current: SessionId | undefined): DesktopTeamRootProps {
  const snapshot = { current, phase: 'ready' }
  return {
    useSessions: bindSnapshotSelector({ getSnapshot: () => snapshot, subscribe: () => () => {} }),
    ensureSession: () => Promise.resolve(),
    useColorScheme: bindSnapshotSelector({
      getSnapshot: () => 'dark' as const,
      subscribe: () => () => {},
    }),
    toggleTheme: () => {},
    load: () => Promise.resolve({ ok: true, value: view }),
    createTask: () => Promise.reject(new Error('not used')),
    updateTask: () => Promise.reject(new Error('not used')),
    spawnTeammate: () => Promise.reject(new Error('not used')),
    sendMessage: () => Promise.reject(new Error('not used')),
    interrupt: () => Promise.reject(new Error('not used')),
    follow: () => () => {},
    activity: () => Promise.resolve({ ok: true, value: [] }),
    // Tail rows reveal in sequence; under reduced motion they simply appear.
    tail: () => Promise.resolve({
      ok: true,
      value: [
        { seq: 2, time: 0, kind: 'tool', name: 'write', text: '{"filePath":"a.ts"}' },
        { seq: 1, time: 0, kind: 'assistant', text: 'drafting' },
      ],
    }),
    openTeammate: () => Promise.resolve(),
    t: makeTranslate(zh, commonZh),
  } as unknown as DesktopTeamRootProps
}

describe('reduced motion', () => {
  it('prepares the desktop seats without spatial animation', () => {
    render(<DesktopTeamRoot {...props(undefined)} />)
    expect(screen.getByText(zh.preparingLead)).toBeTruthy()
  })

  it('opens the workspace and expands a roster card without spatial animation', async () => {
    const surface = props(SESSION) as unknown as TeamSurfaceProps
    render(<TeamAction {...surface} sessionId={SESSION} standalone />)
    expect(await screen.findByText('Implement runtime')).toBeTruthy()

    // Expanding a card is the reveal tier; the detail it uncovers names the
    // teammate's assigned work and its scope overlap.
    const card = document.querySelector(`[data-team-member-card="${WORKER}"]`)
    if (card === null) throw new Error('the roster did not render the teammate')
    fireEvent.focus(card)
    expect(await screen.findByText(zh.scopeOverlap)).toBeTruthy()
    // The expanded detail names the work assigned to that teammate.
    expect(screen.getAllByText('Implement runtime').length).toBeGreaterThan(1)
    // The tail's rows are present without their staged reveal.
    expect(document.querySelectorAll('[data-team-tail] > li')).toHaveLength(2)
  })
})
