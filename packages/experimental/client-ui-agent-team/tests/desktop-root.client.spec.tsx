// @vitest-environment jsdom

/** The desktop-owned root: it enters an existing Session or prepares one first. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TeamView } from '@deepseek-ai/dsh-experimental-agent-team/client'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { DesktopTeamRoot, type DesktopTeamRootProps } from '../src/client/DesktopTeamRoot.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const SESSION = 'lead' as SessionId
const view: TeamView = {
  members: [{ id: SESSION, name: 'lead', role: 'lead', status: 'idle', pendingMessages: 0, diagnostics: [] }],
  tasks: [],
  capacity: 4,
}

interface SessionSnapshot {
  current: SessionId | undefined
  phase: string
}

function props(overrides: {
  snapshot?: Partial<SessionSnapshot>
  ensureSession?: () => Promise<void>
} = {}): DesktopTeamRootProps {
  const snapshot: SessionSnapshot = {
    current: undefined,
    phase: 'ready',
    ...overrides.snapshot,
  }
  return {
    useSessions: bindSnapshotSelector({
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
    }),
    ensureSession: overrides.ensureSession ?? (() => Promise.resolve()),
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
    tail: () => Promise.resolve({ ok: true, value: [] }),
    openTeammate: () => Promise.resolve(),
    t: makeTranslate(zh, commonZh),
  } as unknown as DesktopTeamRootProps
}

describe('DesktopTeamRoot', () => {
  it('prepares a Session once when the runtime is ready and none is current', async () => {
    const ensureSession = vi.fn(() => Promise.resolve())
    const rendered = render(<DesktopTeamRoot {...props({ ensureSession })} />)

    expect(screen.getByText(zh.preparingSession)).toBeTruthy()
    // The lead seat says what is being prepared; the rest read as open capacity.
    expect(screen.getByText(zh.preparingLead)).toBeTruthy()
    expect(screen.getAllByText(zh.openSeat)).toHaveLength(3)
    await waitFor(() => { expect(ensureSession).toHaveBeenCalledOnce() })

    // A re-render must not start a second attempt.
    rendered.rerender(<DesktopTeamRoot {...props({ ensureSession })} />)
    expect(ensureSession).toHaveBeenCalledOnce()
  })

  it('waits for the Session runtime before attempting anything', () => {
    const ensureSession = vi.fn(() => Promise.resolve())
    render(<DesktopTeamRoot {...props({ ensureSession, snapshot: { phase: 'loading' } })} />)
    expect(ensureSession).not.toHaveBeenCalled()
  })

  it('reports a refused attempt and retries on demand', async () => {
    const ensureSession = vi.fn()
      .mockRejectedValueOnce(new Error('no workspace'))
      .mockRejectedValueOnce('lost the connection')
      .mockResolvedValue(undefined)
    render(<DesktopTeamRoot {...props({ ensureSession })} />)

    expect((await screen.findByRole('alert')).textContent).toContain('no workspace')
    fireEvent.click(screen.getByRole('button', { name: zh.retry }))
    // A non-Error rejection still names itself rather than rendering nothing.
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('lost the connection')
    })
    fireEvent.click(screen.getByRole('button', { name: zh.retry }))
    await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull() })
    expect(ensureSession).toHaveBeenCalledTimes(3)
  })

  it('drops the seat animation when the viewer prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    })))
    render(<DesktopTeamRoot {...props()} />)
    expect(screen.getByText(zh.preparingLead)).toBeTruthy()
  })

  it('mounts the live workspace once a Session is current', async () => {
    const ensureSession = vi.fn(() => Promise.resolve())
    render(<DesktopTeamRoot {...props({ ensureSession, snapshot: { current: SESSION } })} />)
    expect(await screen.findByText(zh.roster)).toBeTruthy()
    expect(screen.queryByText(zh.preparingSession)).toBeNull()
    expect(ensureSession).not.toHaveBeenCalled()
  })
})
