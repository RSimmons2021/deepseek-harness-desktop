// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  TeamActivityEntry, TeamRole, TeamTailLine, TeamTaskId, TeamTaskView as TeamTask, TeamView,
} from '@deepseek-ai/dsh-experimental-agent-team/client'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import {
  TeamAction, type TeamActionInjected, type TeamActionProps, type TeamActionResult,
  type TeamInterruptActionResult, type TeamMessageActionResult, type TeamSpawnActionResult,
  type TeamTaskActionResult,
} from '../src/client/TeamAction.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const SESSION = 'lead' as SessionId
const TASK_1 = 'task-1' as TeamTaskId
const TASK_2 = 'task-2' as TeamTaskId
const task: TeamTask = {
  id: TASK_1,
  revision: 1,
  subject: 'Implement runtime',
  description: 'Build the Team runtime',
  status: 'in_progress',
  ownerName: 'lead',
  blockedBy: [],
  writeScopes: ['src'],
  ready: false,
  writeScopeWarnings: ['write scopes overlap with task-2'],
}
const blocker: TeamTask = {
  id: TASK_2,
  revision: 1,
  subject: 'Publish the notes',
  description: 'Ship them',
  status: 'pending',
  blockedBy: [],
  writeScopes: [],
  ready: true,
  writeScopeWarnings: [],
}

/** Choose a blocking task the way the board names it, by subject. */
function pickBlocker(subject: string): void {
  fireEvent.click(screen.getByRole('checkbox', { name: subject }))
}

/** Add one write scope through the chip entry. */
function addScope(scope: string): void {
  fireEvent.change(screen.getByPlaceholderText(zh.scopesHint), { target: { value: scope } })
  fireEvent.click(screen.getByRole('button', { name: zh.scopeAdd }))
}

const view: TeamView = {
  members: [
    { id: SESSION, name: 'lead', role: 'lead', status: 'idle', model: 'model-a', pendingMessages: 0, diagnostics: [] },
    {
      id: 'worker-id' as SessionId,
      name: 'worker',
      role: 'teammate',
      status: 'inactive',
      model: 'model-a',
      pendingMessages: 0,
      diagnostics: [],
    },
  ],
  tasks: [task],
  capacity: 8,
}

/** Two ways to staff this Team, one of which routes its teammates elsewhere. */
const TEAM_ROLES: TeamRole[] = [
  { id: 'reviewer', name: 'reviewer', description: 'Reads it back', brief: 'You review.', context: 'fresh' },
  {
    id: 'planner',
    name: 'planner',
    description: 'Breaks the work up',
    brief: 'You plan.',
    context: 'fork',
    route: { model: 'big-model' },
  },
]

/** A board with something to depend on: a task cannot wait for itself. */
const pairedView: TeamView = { ...view, tasks: [task, blocker] }

/** The recorded timeline; the lane headings reuse its status words. */
function timeline(): HTMLElement {
  const recorded = document.querySelector<HTMLElement>('[data-team-activity]')
  if (recorded === null) throw new Error('the timeline did not render')
  return recorded
}

/** The board card for one task, so a two-task board stays unambiguous. */
function taskCard(subject: string): HTMLElement {
  const card = screen.getByText(subject).closest('article')
  if (card === null) throw new Error(`no task card for ${subject}`)
  return card
}

function taskSuccess(value: TeamTask): TeamTaskActionResult {
  return { ok: true, value: { ok: true, value } }
}

function taskConflict(message: string): TeamTaskActionResult {
  return {
    ok: true,
    value: { ok: false, error: { code: 'team-task-conflict', message } },
  }
}

function taskRejected(message: string): TeamTaskActionResult {
  return {
    ok: true,
    value: { ok: false, error: { code: 'team-rejected', message } },
  }
}

function remoteFailure(message: string): { ok: false; error: { code: 'internal'; message: string; details: {} } } {
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

function props(actions: TeamActionInjected, sessionId: SessionId = SESSION): TeamActionProps {
  const { hooks, ...face } = actions
  return {
    sessionId,
    ...face,
    useColorScheme: bindSnapshotSelector(hooks.colorScheme),
    t: makeTranslate(zh, commonZh),
  } as unknown as TeamActionProps
}

function actions(overrides: Partial<TeamActionInjected> = {}): TeamActionInjected {
  return {
    load: () => Promise.resolve({ ok: true, value: view }),
    createTask: () => Promise.resolve(taskSuccess({ ...task, id: TASK_2, subject: 'New task' })),
    updateTask: () => Promise.resolve({
      ok: true,
      value: { ok: true, value: { ...task, revision: 2 } },
    }),
    spawnTeammate: () => Promise.resolve({
      ok: true,
      value: {
        ok: true,
        value: {
          member: {
            id: 'writer-id' as SessionId,
            name: 'writer',
            role: 'teammate',
            status: 'provisioning',
            pendingMessages: 0,
            diagnostics: [],
          },
        },
      },
    }),
    sendMessage: () => Promise.resolve({
      ok: true,
      value: { ok: true, value: { messageId: 'message-1' as never, status: 'accepted' } },
    }),
    interrupt: () => Promise.resolve({
      ok: true,
      value: { ok: true, value: { previousStatus: 'running' } },
    }),
    // Default fixture never emits, so the followed view never lands underneath
    // the assertions; the board still loads through the surface's own refresh.
    follow: () => () => {},
    roles: () => Promise.resolve({ ok: true, value: TEAM_ROLES }),
    activity: () => Promise.resolve({ ok: true, value: [] }),
    tail: () => Promise.resolve({ ok: true, value: [] }),
    openTeammate: () => Promise.resolve(),
    hooks: {
      colorScheme: { getSnapshot: () => 'dark', subscribe: () => () => {} },
    },
    toggleTheme: () => {},
    ...overrides,
  }
}

describe('TeamAction', () => {
  it('ignores a stale Team load after the conversation switches sessions', async () => {
    const nextSession = 'next-lead' as SessionId
    const firstLoad = Promise.withResolvers<{ ok: true; value: TeamView }>()
    const nextView: TeamView = {
      ...view,
      members: [{ id: nextSession, name: 'lead', role: 'lead', status: 'idle', pendingMessages: 0, diagnostics: [] }],
      tasks: [{ ...task, id: 'task-next' as TeamTaskId, subject: 'Next session task' }],
    }
    const load = vi.fn((sessionId: SessionId) => sessionId === SESSION
      ? firstLoad.promise
      : Promise.resolve({ ok: true as const, value: nextView }))
    const injected = actions({ load })
    const rendered = render(<TeamAction {...props(injected)} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await waitFor(() => { expect(load).toHaveBeenCalledWith(SESSION) })

    rendered.rerender(<TeamAction {...props(injected, nextSession)} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    expect(await screen.findByText('Next session task')).toBeTruthy()
    firstLoad.resolve({ ok: true, value: view })
    await Promise.resolve()

    await waitFor(() => {
      expect(screen.getByText('Next session task')).toBeTruthy()
      expect(screen.queryByText('Implement runtime')).toBeNull()
    })
  })

  it('latches a card open on click and navigates from its own control', async () => {
    const openTeammate = vi.fn(() => Promise.resolve())
    render(<TeamAction {...props(actions({ openTeammate }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    const worker = await screen.findByRole('button', { name: /worker/u })
    expect(screen.getByText('write scopes overlap with task-2')).toBeTruthy()

    // Clicking the card opens its detail and keeps it open; navigating away is
    // a separate control, so a click can no longer leave the workspace by
    // accident.
    fireEvent.click(worker)
    expect(await screen.findByText(zh.assignedTasks)).toBeTruthy()
    expect(worker.getAttribute('aria-expanded')).toBe('true')
    expect(openTeammate).not.toHaveBeenCalled()

    // A pinned card survives the pointer leaving the roster entirely.
    const roster = worker.closest('[data-team-member-card]')?.parentElement
    if (roster == null) throw new Error('the roster did not render')
    fireEvent.pointerLeave(roster, { pointerType: 'mouse' })
    expect(screen.getByText(zh.assignedTasks)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh.open }))
    await waitFor(() => { expect(openTeammate).toHaveBeenCalledWith(SESSION, view.members[1]) })

    // Clicking the same card again releases it.
    fireEvent.click(worker)
    expect(worker.getAttribute('aria-expanded')).toBe('false')
  })

  it('interrupts a running teammate and reloads the roster afterwards', async () => {
    const running: TeamView = {
      ...view,
      members: view.members.map(member => member.role === 'teammate'
        ? { ...member, status: 'running' as const }
        : member),
    }
    const load = vi.fn(() => Promise.resolve({ ok: true as const, value: running }))
    const interrupt = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: { ok: true as const, value: { previousStatus: 'running' as const } },
    }))
    render(<TeamAction {...props(actions({ load, interrupt }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))

    const stop = await screen.findByRole('button', { name: zh.interrupt })
    fireEvent.click(stop)
    await waitFor(() => { expect(interrupt).toHaveBeenCalledWith(SESSION, 'worker') })
    await waitFor(() => { expect(load).toHaveBeenCalledTimes(2) })
  })

  it('spawns a teammate from the first open seat and reloads the roster', async () => {
    const load = vi.fn(() => Promise.resolve({ ok: true as const, value: view }))
    const spawnTeammate = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: {
        ok: true as const,
        value: {
          member: {
            id: 'writer-id' as SessionId,
            name: 'writer',
            role: 'teammate' as const,
            status: 'provisioning' as const,
            pendingMessages: 0,
            diagnostics: [],
          },
        },
      },
    }))
    render(<TeamAction {...props(actions({ load, spawnTeammate }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))

    const add = await screen.findByRole('button', { name: new RegExp(zh.addTeammate, 'u') })
    fireEvent.click(add)
    fireEvent.click(await screen.findByRole('radio', { name: /reviewer/u }))
    fireEvent.change(screen.getByPlaceholderText(zh.teammatePrompt), { target: { value: 'draft the release note' } })
    fireEvent.click(screen.getByRole('button', { name: zh.spawn }))

    await waitFor(() => {
      expect(spawnTeammate).toHaveBeenCalledWith(SESSION, {
        role: 'reviewer',
        prompt: 'draft the release note',
      })
    })
    await waitFor(() => { expect(load).toHaveBeenCalledTimes(2) })
  })

  it('keeps the spawn control on only the first open seat', async () => {
    render(<TeamAction {...props(actions())} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByRole('button', { name: /worker/u })
    expect(screen.getAllByRole('button', { name: new RegExp(zh.addTeammate, 'u') })).toHaveLength(1)
    // Two members and four seats leaves one addable seat plus one inert seat.
    expect(screen.getAllByText(zh.openSeat)).toHaveLength(1)
  })

  it('toggles appearance from the workspace toolbar and follows the resolved scheme', async () => {
    let scheme: 'light' | 'dark' = 'dark'
    let notify = (): void => {}
    const toggle = vi.fn(() => {
      scheme = scheme === 'dark' ? 'light' : 'dark'
      notify()
    })
    const colorScheme = {
      subscribe: (onChange: () => void) => { notify = onChange; return () => { notify = () => {} } },
      getSnapshot: () => scheme,
    }
    render(<TeamAction {...props(actions({ hooks: { colorScheme }, toggleTheme: toggle }))} standalone />)

    // Dark offers the way back to light, and the label follows the new scheme.
    const button = await screen.findByRole('button', { name: zh.toLightTheme })
    fireEvent.click(button)
    expect(toggle).toHaveBeenCalledTimes(1)
    await screen.findByRole('button', { name: zh.toDarkTheme })
  })

  it('sends a peer message from a teammate card and closes the composer', async () => {
    const load = vi.fn(() => Promise.resolve({ ok: true as const, value: view }))
    const sendMessage = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: { ok: true as const, value: { messageId: 'message-1' as never, status: 'accepted' as const } },
    }))
    render(<TeamAction {...props(actions({ load, sendMessage }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))

    fireEvent.click(await screen.findByRole('button', { name: zh.message }))
    fireEvent.change(screen.getByPlaceholderText(zh.messageText), { target: { value: 'rebase onto main' } })
    fireEvent.click(screen.getByRole('button', { name: zh.send }))

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(SESSION, {
        target: 'worker',
        message: 'rebase onto main',
        delivery: 'quiet',
      })
    })
    // The composer gives the card back once the message is durable.
    await waitFor(() => { expect(screen.queryByPlaceholderText(zh.messageText)).toBeNull() })
  })

  it('groups the board into lanes and names the task a blocker actually is', async () => {
    const blocker: TeamTask = { ...task, id: 'task-9' as TeamTaskId, subject: 'Land the migration', status: 'in_progress' }
    const blocked: TeamTask = {
      ...task, id: 'task-10' as TeamTaskId, subject: 'Follow-up', status: 'pending', ready: false,
      blockedBy: ['task-9' as TeamTaskId],
    }
    const board: TeamView = { ...view, tasks: [blocked, blocker] }
    render(<TeamAction {...props(actions({ load: () => Promise.resolve({ ok: true, value: board }) }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))

    // Running work leads, then what is waiting on it.
    const lanes = (await screen.findAllByRole('heading', { level: 4 })).map(h => h.textContent)
    expect(lanes[0]).toContain(zh.laneActive)
    expect(lanes[1]).toContain(zh.laneBlocked)
    // A raw id says nothing about what is in the way.
    expect(screen.getByText(/Land the migration/u, { selector: 'span' })).toBeTruthy()
  })

  it('shows which members claim the same write scopes, since scopes are advisory', async () => {
    const mine: TeamTask = { ...task, id: 'task-11' as TeamTaskId, ownerName: 'worker', writeScopes: ['src/'] }
    const yours: TeamTask = { ...task, id: 'task-12' as TeamTaskId, ownerName: 'lead', writeScopes: ['src/'] }
    const board: TeamView = { ...view, tasks: [mine, yours] }
    render(<TeamAction {...props(actions({ load: () => Promise.resolve({ ok: true, value: board }) }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))

    expect(await screen.findByText(zh.scopeMap)).toBeTruthy()
    expect(screen.getByText(zh.scopeShared)).toBeTruthy()
  })

  it('withholds the spawn control until the Team has work to delegate', async () => {
    const idle: TeamView = { ...view, tasks: [] }
    const load = vi.fn(() => Promise.resolve({ ok: true as const, value: idle }))
    render(<TeamAction {...props(actions({ load }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByRole('button', { name: /worker/u })

    // Nothing on the board and nobody running: spawning a permanent teammate is
    // not the move the surface should offer first.
    expect(screen.queryByRole('button', { name: new RegExp(zh.addTeammate, 'u') })).toBeNull()
    expect(screen.getAllByText(zh.seatLocked)).toHaveLength(1)
  })

  it('acknowledges an interrupt that lands between polls', async () => {
    const running: TeamView = {
      ...view,
      members: view.members.map(member => member.role === 'teammate'
        ? { ...member, status: 'running' as const }
        : member),
    }
    render(<TeamAction {...props(actions({ load: () => Promise.resolve({ ok: true, value: running }) }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    fireEvent.click(await screen.findByRole('button', { name: zh.interrupt }))
    expect(await screen.findByText(zh.interrupted)).toBeTruthy()
  })

  it('offers no interrupt for a teammate that is not running', async () => {
    render(<TeamAction {...props(actions())} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByRole('button', { name: /worker/u })
    expect(screen.queryByRole('button', { name: zh.interrupt })).toBeNull()
  })

  it('takes each followed view, and shows a terminal stream failure', async () => {
    const load = vi.fn(() => Promise.resolve({ ok: true as const, value: view }))
    let accept: ((followed: TeamView) => void) | undefined
    let failed: ((error: unknown) => void) | undefined
    const stop = vi.fn()
    const follow = vi.fn((
      _session: SessionId,
      onView: (followed: TeamView) => void,
      onFailed: (error: unknown) => void,
    ) => {
      accept = onView
      failed = onFailed
      return stop
    })
    const rendered = render(<TeamAction {...props(actions({ load, follow }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    // A followed view replaces the board without another read.
    act(() => {
      accept?.({ ...view, tasks: [{ ...task, subject: 'Followed task' }] })
    })
    expect(await screen.findByText('Followed task')).toBeTruthy()
    expect(load).toHaveBeenCalledOnce()

    // A terminal failure is reported and leaves the manual refresh as the way back.
    act(() => { failed?.(new Error('gateway closed')) })
    expect((await screen.findByRole('alert')).textContent).toContain('gateway closed')

    // One that arrives after the conversation has moved on reaches nobody.
    const stale = failed
    rendered.rerender(<TeamAction {...props(actions({ load, follow }), 'next-session' as SessionId)} />)
    act(() => { stale?.(new Error('too late to matter')) })
    expect(screen.queryByText(/too late to matter/u)).toBeNull()

    // Switching sessions stopped the first follow; unmounting stops the second,
    // so neither is left running against a surface nobody is watching.
    rendered.unmount()
    expect(stop).toHaveBeenCalledTimes(2)
  })

  it('ignores a followed view that arrives for a session the surface has left', async () => {
    const load = vi.fn(() => Promise.resolve({ ok: true as const, value: view }))
    let accept: ((followed: TeamView) => void) | undefined
    const follow = vi.fn((_session: SessionId, onView: (followed: TeamView) => void) => {
      accept = onView
      return () => {}
    })
    const injected = actions({ load, follow })
    const rendered = render(<TeamAction {...props(injected)} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    const stale = accept
    rendered.rerender(<TeamAction {...props(injected, 'next-session' as SessionId)} />)
    act(() => { stale?.({ ...view, tasks: [{ ...task, subject: 'Stale board' }] }) })
    expect(screen.queryByText('Stale board')).toBeNull()
  })


  it('expands a member card for mouse hover and keyboard focus without treating touch as hover', async () => {
    render(<TeamAction {...props(actions())} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    const worker = await screen.findByRole('button', { name: /worker/u })
    const card = worker.closest<HTMLElement>('[data-team-member-card]')
    if (card === null) throw new Error('worker card missing')

    fireEvent.pointerEnter(card, { pointerType: 'touch' })
    expect(card.dataset.expanded).toBe('false')
    fireEvent.pointerEnter(card, { pointerType: 'mouse' })
    expect(card.dataset.expanded).toBe('true')
    const roster = card.closest<HTMLElement>('[role="list"]')
    if (roster === null) throw new Error('Team roster missing')
    fireEvent.pointerLeave(roster, { pointerType: 'mouse' })
    expect(card.dataset.expanded).toBe('false')
    fireEvent.focus(worker)
    expect(card.dataset.expanded).toBe('true')
    fireEvent.blur(worker)
    expect(card.dataset.expanded).toBe('false')
  })

  it('lets a standalone workspace pause and resume ambient background motion', async () => {
    render(<TeamAction {...props(actions())} standalone />)
    await screen.findByText('Implement runtime')

    const pause = screen.getByRole('button', { name: zh.pauseMotion })
    fireEvent.click(pause)
    expect(screen.getByRole('button', { name: zh.resumeMotion })).toBeTruthy()
  })

  it('keeps only the newest overlapping refresh for one session', async () => {
    const older = Promise.withResolvers<TeamActionResult<TeamView>>()
    const newer = Promise.withResolvers<TeamActionResult<TeamView>>()
    const newestView = {
      ...view,
      tasks: [{ ...task, id: 'newest-task' as TeamTaskId, subject: 'Newest task' }],
    }
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: view })
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise)
    render(<TeamAction {...props(actions({ load }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    const refresh = screen.getByRole('button', { name: zh.refresh })
    fireEvent.click(refresh)
    fireEvent.click(refresh)
    newer.resolve({ ok: true, value: newestView })
    expect(await screen.findByText('Newest task')).toBeTruthy()
    older.resolve({ ok: true, value: view })
    await Promise.resolve()

    expect(screen.getByText('Newest task')).toBeTruthy()
    expect(screen.queryByText('Implement runtime')).toBeNull()
  })

  it('keeps a successful task mutation newer than an in-flight refresh', async () => {
    const stale = Promise.withResolvers<TeamActionResult<TeamView>>()
    const completedView = { ...view, tasks: [{ ...task, revision: 2, status: 'completed' as const }] }
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: view })
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValueOnce({ ok: true, value: completedView })
    const updateTask = vi.fn(() => Promise.resolve(
      taskSuccess({ ...task, revision: 2, status: 'completed' }),
    ))
    render(<TeamAction {...props(actions({ load, updateTask }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    fireEvent.click(screen.getByRole('button', { name: /完成/u }))
    expect(await screen.findByRole('button', { name: /重开/u })).toBeTruthy()

    stale.resolve({ ok: true, value: view })
    await Promise.resolve()
    expect(screen.getByRole('button', { name: /重开/u })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /完成/u })).toBeNull()
  })

  it('keeps a created task newer than an in-flight refresh', async () => {
    const stale = Promise.withResolvers<TeamActionResult<TeamView>>()
    const createdTask = { ...task, id: TASK_2, subject: 'New task' }
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: view })
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValueOnce({ ok: true, value: { ...view, tasks: [...view.tasks, createdTask] } })
    render(<TeamAction {...props(actions({
      load,
      createTask: () => Promise.resolve(taskSuccess(createdTask)),
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'New task' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: 'Details' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('New task')).toBeTruthy()

    stale.resolve({ ok: true, value: view })
    await Promise.resolve()
    expect(screen.getByText('New task')).toBeTruthy()
  })

  it('keeps task and create failures newer than an in-flight refresh', async () => {
    const staleTask = Promise.withResolvers<TeamActionResult<TeamView>>()
    const taskLoad = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: view })
      .mockImplementationOnce(() => staleTask.promise)
    const first = render(<TeamAction {...props(actions({
      load: taskLoad,
      updateTask: () => Promise.resolve(taskRejected('task rejected')),
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    fireEvent.click(screen.getByRole('button', { name: /完成/u }))
    expect(await screen.findByText('task rejected (team-rejected)')).toBeTruthy()
    staleTask.resolve({ ok: true, value: view })
    await Promise.resolve()
    expect(screen.getByText('task rejected (team-rejected)')).toBeTruthy()
    first.unmount()

    const staleCreate = Promise.withResolvers<TeamActionResult<TeamView>>()
    const createLoad = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: view })
      .mockImplementationOnce(() => staleCreate.promise)
    render(<TeamAction {...props(actions({
      load: createLoad,
      createTask: () => Promise.resolve(taskRejected('create rejected')),
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Rejected task' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: 'Rejected details' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('create rejected (team-rejected)')).toBeTruthy()
    staleCreate.resolve({ ok: true, value: view })
    await Promise.resolve()
    expect(screen.getByText('create rejected (team-rejected)')).toBeTruthy()
  })

  it('tracks simultaneous create and task mutations independently', async () => {
    const create = Promise.withResolvers<TeamTaskActionResult>()
    const createdTask = { ...task, id: TASK_2, subject: 'Concurrent task' }
    const completedTask = { ...task, revision: 2, status: 'completed' as const }
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: view })
      .mockResolvedValueOnce({ ok: true, value: { ...view, tasks: [completedTask] } })
      .mockResolvedValueOnce({ ok: true, value: { ...view, tasks: [completedTask, createdTask] } })
    const createTask = vi.fn(() => create.promise)
    render(<TeamAction {...props(actions({ load, createTask }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Concurrent task' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: 'Concurrent details' } })
    const save = screen.getByRole<HTMLButtonElement>('button', { name: '保存' })
    fireEvent.click(save)
    await waitFor(() => { expect(save.disabled).toBe(true) })

    const complete = screen.getByRole<HTMLButtonElement>('button', { name: /完成/u })
    expect(complete.disabled).toBe(false)
    fireEvent.click(complete)
    expect(await screen.findByRole('button', { name: /重开/u })).toBeTruthy()
    expect(save.disabled).toBe(true)
    fireEvent.click(save)
    expect(createTask).toHaveBeenCalledTimes(1)

    create.resolve(taskSuccess(createdTask))
    expect(await screen.findByText('Concurrent task')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
  })

  it('reloads derived fields for every task after a mutation', async () => {
    const related = {
      ...task,
      id: TASK_2,
      subject: 'Related task',
      writeScopeWarnings: ['old warning'],
    }
    const completed = { ...task, revision: 2, status: 'completed' as const }
    const refreshed = {
      ...view,
      tasks: [completed, { ...related, writeScopeWarnings: ['derived warning refreshed'] }],
    }
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: { ...view, tasks: [task, related] } })
      .mockResolvedValueOnce({ ok: true, value: refreshed })
    render(<TeamAction {...props(actions({
      load,
      updateTask: () => Promise.resolve(taskSuccess(completed)),
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('old warning')
    fireEvent.click(screen.getAllByRole('button', { name: /完成/u })[0]!)

    expect(await screen.findByText('derived warning refreshed')).toBeTruthy()
    expect(screen.queryByText('old warning')).toBeNull()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('creates a task from normalized blocker and write-scope lists', async () => {
    const createTask = vi.fn(actions().createTask)
    render(<TeamAction {...props(actions({ createTask }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: ' New task ' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: ' Details ' } })
    pickBlocker('Implement runtime')
    addScope('src/a')
    addScope('src/b')
    // The same scope twice is one claim.
    addScope('src/a')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith(SESSION, {
        subject: 'New task',
        description: 'Details',
        blockedBy: ['task-1'],
        writeScopes: ['src/a', 'src/b'],
      })
    })
  })

  it('assigns, edits, completes, reopens, and deletes with contiguous CAS revisions', async () => {
    let current = { ...task }
    const updateTask: TeamActionInjected['updateTask'] = vi.fn((
      _sessionId: SessionId,
      input: Parameters<TeamActionInjected['updateTask']>[1],
    ) => {
      const revision = current.revision + 1
      switch (input.action) {
        case 'reassign':
          current = {
            ...current,
            revision,
            status: 'in_progress',
            ownerName: input.owner ?? 'lead',
          }
          break
        case 'edit':
          current = {
            ...current,
            revision,
            subject: input.subject ?? current.subject,
            description: input.description ?? current.description,
            writeScopes: input.writeScopes ?? current.writeScopes,
          }
          break
        case 'set_dependencies':
          current = { ...current, revision, blockedBy: input.blockedBy ?? [] }
          break
        case 'complete':
          current = { ...current, revision, status: 'completed' }
          break
        case 'reopen': {
          const { ownerName: _ownerName, ...unowned } = current
          current = { ...unowned, revision, status: 'pending', ready: true }
          break
        }
        case 'delete':
          current = { ...current, revision, status: 'deleted' }
          break
        default:
          throw new Error(`unexpected action ${input.action}`)
      }
      return Promise.resolve(taskSuccess(current))
    })
    const load = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: { ...view, tasks: current.status === 'deleted' ? [blocker] : [current, blocker] },
    }))
    render(<TeamAction {...props(actions({ load, updateTask }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    // By id, not by subject: the subject changes mid-test, and once the task
    // depends on the other one its card names that one too.
    const owned = (): HTMLElement => {
      const card = screen.getAllByRole('article').find(node => (node.textContent ?? '').includes(TASK_1))
      if (card === undefined) throw new Error('the task under edit left the board')
      return card
    }
    fireEvent.change(within(owned()).getByRole('combobox'), { target: { value: 'worker' } })
    await waitFor(() => {
      expect(within(owned()).getByRole<HTMLSelectElement>('combobox').value).toBe('worker')
      expect(current).toMatchObject({ revision: 2, ownerName: 'worker' })
    })

    fireEvent.click(within(owned()).getByRole('button', { name: /编辑/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Updated runtime' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: 'Updated details' } })
    pickBlocker('Publish the notes')
    addScope('src/runtime')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('Updated runtime')).toBeTruthy()
    expect(current).toMatchObject({
      revision: 4,
      description: 'Updated details',
      blockedBy: [TASK_2],
      // Editing adds to the scopes the task already claimed rather than
      // replacing them, which retyping a comma list used to force.
      writeScopes: ['src', 'src/runtime'],
    })

    fireEvent.click(within(owned()).getByRole('button', { name: /完成/u }))
    fireEvent.click(await screen.findByRole('button', { name: /重开/u }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /重开/u })).toBeNull()
      expect(current).toMatchObject({ revision: 6, status: 'pending' })
    })
    fireEvent.click(within(owned()).getByRole('button', { name: /删除/u }))
    expect(updateTask).toHaveBeenCalledTimes(5)
    const confirmation = screen.getByRole('group', { name: `${zh.deleteConfirm}: Updated runtime` })
    fireEvent.click(within(confirmation).getByRole('button', { name: zh.delete }))
    await waitFor(() => { expect(screen.queryByText('Updated runtime')).toBeNull() })

    expect(vi.mocked(updateTask).mock.calls.map(([, input]) => [input.action, input.expectedRevision]))
      .toEqual([
        ['reassign', 1],
        ['edit', 2],
        ['set_dependencies', 3],
        ['complete', 4],
        ['reopen', 5],
        ['delete', 6],
      ])
  })

  it('reloads and warns instead of retrying a stale task mutation', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: view })
      .mockResolvedValueOnce({ ok: true, value: { ...view, tasks: [{ ...task, revision: 2 }] } })
    const updateTask = vi.fn(() => Promise.resolve(taskConflict('stale')))
    render(<TeamAction {...props(actions({ load, updateTask }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /完成/u }))
    expect(await screen.findByText(zh.conflict)).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
    expect(updateTask).toHaveBeenCalledTimes(1)
  })

  it('keeps reload failures visible after task and dependency conflicts', async () => {
    const taskLoad = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: view })
      .mockResolvedValueOnce(remoteFailure('task reload failed'))
    const first = render(<TeamAction {...props(actions({
      load: taskLoad,
      updateTask: () => Promise.resolve(taskConflict('stale task')),
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /完成/u }))
    expect(await screen.findByText('task reload failed (internal)')).toBeTruthy()
    expect(screen.queryByText(zh.conflict)).toBeNull()
    first.unmount()

    const dependencyLoad = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: pairedView })
      .mockResolvedValueOnce({ ok: true, value: { ...pairedView, tasks: [{ ...task, revision: 2, subject: 'Edited' }, blocker] } })
      .mockResolvedValueOnce(remoteFailure('dependency reload failed'))
    const dependencyUpdate = vi.fn()
      .mockResolvedValueOnce(taskSuccess({ ...task, revision: 2, subject: 'Edited' }))
      .mockResolvedValueOnce(taskConflict('stale dependency'))
    render(<TeamAction {...props(actions({ load: dependencyLoad, updateTask: dependencyUpdate }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(within(taskCard('Implement runtime')).getByRole('button', { name: /编辑/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Edited' } })
    pickBlocker('Publish the notes')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('dependency reload failed (internal)')).toBeTruthy()
    expect(screen.queryByText(zh.conflict)).toBeNull()
  })

  it('renders roster/task state variants and contains navigation, refresh, and close actions', async () => {
    const { ownerName: _ownerName, ...unownedTask } = task
    const richView: TeamView = {
      ...view,
      members: [
        view.members[0]!,
        { ...view.members[1]!, status: 'running' },
        {
          id: 'failed-id' as SessionId,
          name: 'failed-worker',
          role: 'teammate',
          status: 'failed',
          pendingMessages: 0,
          diagnostics: ['provider failed'],
        },
        {
          id: 'provisioning-id' as SessionId,
          name: 'provisioning-worker',
          role: 'teammate',
          status: 'provisioning',
          pendingMessages: 0,
          diagnostics: [],
        },
      ],
      tasks: [
        { ...unownedTask, id: 'ready-task' as TeamTaskId, status: 'pending', ready: true },
        { ...unownedTask, id: 'blocked-task' as TeamTaskId, status: 'pending', ready: false },
        { ...task, id: 'completed-task' as TeamTaskId, status: 'completed' },
      ],
    }
    const load = vi.fn(() => Promise.resolve({ ok: true as const, value: richView }))
    const openTeammate = vi.fn(() => Promise.reject(new Error('navigation failed')))
    render(<TeamAction {...props(actions({ load, openTeammate }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    expect(await screen.findByText('provider failed')).toBeTruthy()
    // Readiness is stated by the lane a task sits in, not repeated per card.
    expect(screen.getByText(zh.laneReady)).toBeTruthy()
    expect(screen.getByText(zh.laneBlocked)).toBeTruthy()
    // Every card expands, including the unreachable ones — their detail is
    // where the diagnostic lives. Only a healthy teammate offers navigation.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /failed-worker/u }).disabled).toBe(false)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /provisioning-worker/u }).disabled).toBe(false)
    expect(screen.getAllByRole('button', { name: zh.open })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: zh.open }))
    expect(await screen.findByText('Error: navigation failed')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    await waitFor(() => { expect(load).toHaveBeenCalledTimes(2) })
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: zh.close }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows load and create failures and ignores a create result after a session switch', async () => {
    const failedLoad = actions({
      load: () => Promise.resolve(remoteFailure('load failed')),
    })
    const first = render(<TeamAction {...props(failedLoad)} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    expect(await screen.findByText('load failed (internal)')).toBeTruthy()
    first.unmount()

    const createTask = vi.fn(() => Promise.resolve(remoteFailure('create failed')))
    const second = render(<TeamAction {...props(actions({ createTask }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Task' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: 'Description' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('create failed (internal)')).toBeTruthy()
    second.unmount()

    const pending = Promise.withResolvers<TeamTaskActionResult>()
    const third = render(<TeamAction {...props(actions({ createTask: () => pending.promise }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Late task' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: 'Late description' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    third.rerender(<TeamAction {...props(actions(), 'next-session' as SessionId)} />)
    pending.resolve(taskSuccess({ ...task, id: 'late-task' as TeamTaskId }))
    await Promise.resolve()
    expect(screen.queryByText('Late task')).toBeNull()
  })

  it('contains stale-session and ordinary task failures without retrying', async () => {
    const pending = Promise.withResolvers<TeamTaskActionResult>()
    const rendered = render(<TeamAction {...props(actions({ updateTask: () => pending.promise }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /完成/u }))
    rendered.rerender(<TeamAction {...props(actions(), 'next-session' as SessionId)} />)
    pending.resolve(taskSuccess({ ...task, revision: 2, status: 'completed' }))
    await Promise.resolve()
    expect(screen.queryByText('Implement runtime')).toBeNull()
    rendered.unmount()

    render(<TeamAction {...props(actions({
      updateTask: () => Promise.resolve(taskRejected('update failed')),
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /完成/u }))
    expect(await screen.findByText('update failed (team-rejected)')).toBeTruthy()
  })

  it('does not publish a task conflict after its reload switches sessions', async () => {
    const reload = Promise.withResolvers<TeamActionResult<TeamView>>()
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: view })
      .mockImplementationOnce(() => reload.promise)
    const rendered = render(<TeamAction {...props(actions({
      load,
      updateTask: () => Promise.resolve(taskConflict('stale task')),
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /完成/u }))
    await waitFor(() => { expect(load).toHaveBeenCalledTimes(2) })

    rendered.rerender(<TeamAction {...props(actions(), 'next-session' as SessionId)} />)
    reload.resolve({ ok: true, value: view })
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.queryByText(zh.conflict)).toBeNull()
  })

  it('does not settle a successful task after its reload switches sessions', async () => {
    const reload = Promise.withResolvers<TeamActionResult<TeamView>>()
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: view })
      .mockImplementationOnce(() => reload.promise)
    const rendered = render(<TeamAction {...props(actions({
      load,
      updateTask: () => Promise.resolve(taskSuccess({ ...task, revision: 2, status: 'completed' })),
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /完成/u }))
    await waitFor(() => { expect(load).toHaveBeenCalledTimes(2) })

    rendered.rerender(<TeamAction {...props(actions(), 'next-session' as SessionId)} />)
    reload.resolve({ ok: true, value: { ...view, tasks: [{ ...task, revision: 2, status: 'completed' }] } })
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.queryByText('Implement runtime')).toBeNull()
  })

  it('contains edit and dependency failures and supports form cancellation and unassignment', async () => {
    const { ownerName: _ownerName, ...unownedTask } = task
    const updateTask = vi.fn()
      .mockResolvedValueOnce(remoteFailure('edit failed'))
      .mockResolvedValueOnce(taskSuccess({ ...task, revision: 2, subject: 'Saved edit' }))
      .mockResolvedValueOnce(taskRejected('dependency failed'))
      .mockResolvedValueOnce(taskSuccess({ ...unownedTask, revision: 2 }))
    render(<TeamAction {...props(actions({
      load: () => Promise.resolve({ ok: true, value: pairedView }),
      updateTask,
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    const edited = (): HTMLElement => taskCard('Implement runtime')

    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByPlaceholderText('任务标题')).toBeNull()

    fireEvent.click(within(edited()).getByRole('button', { name: /编辑/u }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
    fireEvent.click(within(edited()).getByRole('button', { name: /编辑/u }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('edit failed (internal)')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Saved edit' } })
    pickBlocker('Publish the notes')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('dependency failed (team-rejected)')).toBeTruthy()
    expect(updateTask.mock.calls[2]?.[1]).toMatchObject({
      action: 'set_dependencies',
      expectedRevision: 2,
      blockedBy: ['task-2'],
    })

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.change(within(edited()).getByRole('combobox'), { target: { value: '' } })
    await waitFor(() => {
      expect(updateTask).toHaveBeenLastCalledWith(SESSION, expect.objectContaining({
        action: 'reassign',
      }))
      expect(updateTask.mock.calls.at(-1)?.[1]).not.toHaveProperty('owner')
    })
  })

  it('shows a Remote carrier failure from the dependency mutation', async () => {
    const updateTask = vi.fn()
      .mockResolvedValueOnce(taskSuccess({ ...task, revision: 2, subject: 'Edited' }))
      .mockResolvedValueOnce(remoteFailure('dependency transport failed'))
    render(<TeamAction {...props(actions({
      load: () => Promise.resolve({ ok: true, value: pairedView }),
      updateTask,
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(within(taskCard('Implement runtime')).getByRole('button', { name: /编辑/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Edited' } })
    pickBlocker('Publish the notes')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('dependency transport failed (internal)')).toBeTruthy()
  })

  it('skips the dependency mutation when an edit keeps the same blockers', async () => {
    const blockedTask: TeamTask = { ...task, blockedBy: ['task-0' as TeamTaskId] }
    const updateTask = vi.fn().mockResolvedValue(
      taskSuccess({ ...blockedTask, revision: 2, subject: 'Same dependencies' }),
    )
    render(<TeamAction {...props(actions({
      load: () => Promise.resolve({ ok: true, value: { ...view, tasks: [blockedTask] } }),
      updateTask,
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /编辑/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Same dependencies' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => { expect(screen.queryByRole('button', { name: '保存' })).toBeNull() })
    expect(updateTask).toHaveBeenCalledTimes(1)
    expect(updateTask).toHaveBeenCalledWith(SESSION, expect.objectContaining({ action: 'edit' }))
  })

  it('reloads a dependency conflict and ignores dependency settlement after a session switch', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: pairedView })
      .mockResolvedValueOnce({ ok: true, value: { ...pairedView, tasks: [{ ...task, revision: 2, subject: 'Conflict edit' }, blocker] } })
      .mockResolvedValueOnce({ ok: true, value: { ...pairedView, tasks: [{ ...task, revision: 3 }, blocker] } })
    const conflictUpdate = vi.fn()
      .mockResolvedValueOnce(taskSuccess({ ...task, revision: 2, subject: 'Conflict edit' }))
      .mockResolvedValueOnce(taskConflict('stale dependency'))
    const first = render(<TeamAction {...props(actions({ load, updateTask: conflictUpdate }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(within(taskCard('Implement runtime')).getByRole('button', { name: /编辑/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Conflict edit' } })
    pickBlocker('Publish the notes')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText(zh.conflict)).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(3)
    first.unmount()

    const dependencyReload = Promise.withResolvers<TeamActionResult<TeamView>>()
    const dependencyLoad = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: pairedView })
      .mockResolvedValueOnce({ ok: true, value: { ...pairedView, tasks: [{ ...task, revision: 2, subject: 'Late edit' }, blocker] } })
      .mockImplementationOnce(() => dependencyReload.promise)
    const staleUpdate = vi.fn()
      .mockResolvedValueOnce(taskSuccess({ ...task, revision: 2, subject: 'Late edit' }))
      .mockResolvedValueOnce(taskConflict('stale dependency'))
    const second = render(<TeamAction {...props(actions({ load: dependencyLoad, updateTask: staleUpdate }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(within(taskCard('Implement runtime')).getByRole('button', { name: /编辑/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Late edit' } })
    pickBlocker('Publish the notes')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => { expect(dependencyLoad).toHaveBeenCalledTimes(3) })
    second.rerender(<TeamAction {...props(actions(), 'next-session' as SessionId)} />)
    dependencyReload.resolve({ ok: true, value: { ...view, tasks: [{ ...task, revision: 3 }] } })
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.queryByText(zh.conflict)).toBeNull()
    second.unmount()

    const dependency = Promise.withResolvers<TeamTaskActionResult>()
    const lateUpdate = vi.fn()
      .mockResolvedValueOnce(taskSuccess({ ...task, revision: 2, subject: 'Late edit' }))
      .mockImplementationOnce(() => dependency.promise)
    const third = render(<TeamAction {...props(actions({
      load: () => Promise.resolve({ ok: true, value: pairedView }),
      updateTask: lateUpdate,
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(within(taskCard('Implement runtime')).getByRole('button', { name: /编辑/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Late edit' } })
    pickBlocker('Publish the notes')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => { expect(lateUpdate).toHaveBeenCalledTimes(2) })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.savingTask }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '取消' }).disabled).toBe(true)
    third.rerender(<TeamAction {...props(actions(), 'next-session' as SessionId)} />)
    dependency.resolve(taskSuccess({ ...task, revision: 3, subject: 'Late dependency' }))
    await Promise.resolve()
    expect(screen.queryByText('Late dependency')).toBeNull()
  })

  it('names every recorded state and leaves an unknown one raw', async () => {
    const at = 1_700_000_000_000
    const history: TeamActivityEntry[] = [
      { seq: 12, time: at, kind: 'message-queued', subject: 'lead', target: 'writer' },
      { seq: 11, time: at, kind: 'message-delivered', subject: 'lead', target: 'writer' },
      { seq: 10, time: at, kind: 'member', subject: 'writer', state: 'provisioning' },
      { seq: 9, time: at, kind: 'member', subject: 'writer', state: 'active' },
      { seq: 8, time: at, kind: 'member', subject: 'ghost', state: 'failed' },
      { seq: 7, time: at, kind: 'task', subject: 'Implement runtime', state: 'pending' },
      { seq: 6, time: at, kind: 'task', subject: 'Implement runtime', state: 'in_progress' },
      { seq: 5, time: at, kind: 'task', subject: 'Implement runtime', state: 'completed' },
      { seq: 4, time: at, kind: 'task', subject: 'Implement runtime', state: 'deleted' },
      { seq: 3, time: at, kind: 'member', subject: 'writer', state: 'someday' },
    ]
    const activity = vi.fn(() => Promise.resolve({ ok: true as const, value: history }))
    render(<TeamAction {...props(actions({ activity }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))

    await screen.findByText('Implement runtime')
    const recorded = document.querySelector('[data-team-activity]')
    if (recorded === null) throw new Error('the timeline did not render')
    const rows = [...recorded.children]
    // Every durable phase and status this Team can record has copy, and the
    // rows keep the order the service returned, which is newest first.
    expect(rows.map(row => row.lastElementChild?.textContent ?? '')).toEqual([
      zh.activityQueued,
      zh.activityDelivered,
      zh['phase.provisioning'],
      zh['phase.active'],
      zh['phase.failed'],
      zh['status.pending'],
      zh['status.in_progress'],
      zh['status.completed'],
      zh['status.deleted'],
      // A phase this build has no copy for still names its teammate.
      'someday',
    ])
    expect(rows[0]?.textContent).toContain('lead → writer')
    expect(rows[4]?.textContent).toContain('ghost')
    expect(rows[5]?.textContent).toContain(zh.activityKindTask)
    expect(activity).toHaveBeenCalledWith(SESSION, 40)
  })

  it('leaves the timeline empty until the Team records something', async () => {
    render(<TeamAction {...props(actions())} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    expect(await screen.findByText(zh.activityEmpty)).toBeTruthy()
    expect(document.querySelector('[data-team-activity]')).toBeNull()
  })

  it('waits for the first read before saying the Team has done nothing', async () => {
    const first = Promise.withResolvers<TeamActionResult<TeamActivityEntry[]>>()
    render(<TeamAction {...props(actions({ activity: () => first.promise }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    // The claim is about a read that has not answered, so it is not made yet.
    expect(screen.queryByText(zh.activityEmpty)).toBeNull()
    expect(screen.getByText(zh.loading)).toBeTruthy()

    first.resolve({ ok: true, value: [] })
    expect(await screen.findByText(zh.activityEmpty)).toBeTruthy()
  })

  it('marks the timeline rows recorded since the last read', async () => {
    const at = 1_700_000_000_000
    const started: TeamActivityEntry = { seq: 1, time: at, kind: 'task', subject: 'Implement runtime', state: 'in_progress' }
    const finished: TeamActivityEntry = { seq: 2, time: at, kind: 'task', subject: 'Implement runtime', state: 'completed' }
    // Each read answers with its own array, the way the transport does: an
    // identical reference would leave React holding the history it already has.
    const activity = vi.fn()
      .mockImplementationOnce(() => Promise.resolve({ ok: true, value: [started] }))
      .mockImplementation(() => Promise.resolve({ ok: true, value: [finished, started] }))
    // A refresh has to answer with its own object or React keeps the view it
    // already holds, and the history follows the view rather than the click.
    const load = () => Promise.resolve({ ok: true as const, value: { ...view } })
    render(<TeamAction {...props(actions({ activity, load }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))

    await waitFor(() => { expect(within(timeline()).getByText(zh['status.in_progress'])).toBeTruthy() })
    // The first read is where the reader starts, so none of it counts as new.
    expect(document.querySelectorAll('[data-team-recorded]').length).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    await waitFor(() => {
      const marked = [...timeline().querySelectorAll('[data-team-recorded]')]
      expect(marked.map(row => row.textContent)).toEqual([expect.stringContaining(zh['status.completed'])])
    })
    // A later read carrying nothing new must not extend the mark, and must not
    // cancel its hold either: the mark means "just now", so it lets go.
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    await waitFor(() => {
      expect(timeline().querySelectorAll('[data-team-recorded]')).toHaveLength(0)
    }, { timeout: 4000 })
  }, 8000)

  it('marks the completion that just landed and leaves the ones already done alone', async () => {
    const done: TeamTask = { ...blocker, status: 'completed' }
    const running: TeamTask = { ...task, writeScopeWarnings: [] }
    const settled: TeamTask = { ...running, revision: 2, status: 'completed' }
    const load = vi.fn()
      .mockImplementationOnce(() => Promise.resolve({ ok: true, value: { ...view, tasks: [running, done] } }))
      .mockImplementation(() => Promise.resolve({ ok: true, value: { ...view, tasks: [settled, done] } }))
    const updateTask = () => Promise.resolve(taskSuccess(settled))
    render(<TeamAction {...props(actions({ load, updateTask }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    // Opening a workspace marks nothing: what is already finished is not news.
    expect(taskCard('Publish the notes').getAttribute('data-team-settled')).toBeNull()

    fireEvent.click(within(taskCard('Implement runtime')).getByRole('button', { name: zh.complete }))
    await waitFor(() => {
      expect(taskCard('Implement runtime').getAttribute('data-team-settled')).toBe('true')
    })
    expect(taskCard('Publish the notes').getAttribute('data-team-settled')).toBeNull()

    // The board keeps arriving while the mark is up — the followed Team reloads
    // on its own. A view carrying no new completion leaves the mark alone, and
    // must not take its hold with it.
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    await waitFor(() => {
      expect(taskCard('Implement runtime').getAttribute('data-team-settled')).toBeNull()
    }, { timeout: 4000 })
  }, 8000)

  it('clears the acknowledgement on its own so the next one still reads as news', async () => {
    render(<TeamAction {...props(actions())} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    fireEvent.click(screen.getByRole('button', { name: zh.message }))
    fireEvent.change(screen.getByPlaceholderText(zh.messageText), { target: { value: 'take task-1' } })
    fireEvent.click(screen.getByRole('button', { name: zh.send }))
    expect(await screen.findByText(zh.messageQueued)).toBeTruthy()

    // Waited out rather than faked: faking the clock or the frame callbacks
    // leaves motion's time base offset once real timers come back, and every
    // exit animation in the tests after this one stops finishing.
    await waitFor(() => { expect(screen.queryByText(zh.messageQueued)).toBeNull() }, { timeout: 8000 })
  }, 12000)

  it('keeps the board when the history is refused and drops history from a past session', async () => {
    // A refused history leaves the board it accompanies alone: the roster and
    // tasks loaded, so the timeline is the only part with nothing to show.
    const refused = render(<TeamAction {...props(actions({ activity: () => Promise.resolve(remoteFailure('no history')) }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    expect(screen.getByText(zh.activityEmpty)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    refused.unmount()

    const late = Promise.withResolvers<TeamActionResult<TeamActivityEntry[]>>()
    const activity = vi.fn()
      .mockImplementationOnce(() => late.promise)
      .mockResolvedValue({ ok: true, value: [] })
    const injected = actions({ activity })
    const rendered = render(<TeamAction {...props(injected)} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    rendered.rerender(<TeamAction {...props(injected, 'next-session' as SessionId)} />)
    late.resolve({ ok: true, value: [{ seq: 1, time: 0, kind: 'task', subject: 'Stale entry', state: 'pending' }] })
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.queryByText('Stale entry')).toBeNull()
  })

  it('reports every refused spawn and leaves a spawn for a past session alone', async () => {
    const spawn = vi.fn()
      .mockResolvedValueOnce(remoteFailure('spawn transport is down'))
      .mockResolvedValueOnce({
        ok: true,
        value: { ok: false, error: { code: 'team-rejected', message: 'name is taken' } },
      })
    const open = async (): Promise<void> => {
      fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
      await screen.findByText('Implement runtime')
      fireEvent.click(screen.getByRole('button', { name: zh.addTeammate }))
      fireEvent.click(await screen.findByRole('radio', { name: /planner/u }))
      fireEvent.change(screen.getByPlaceholderText(zh.teammatePrompt), { target: { value: 'draft it' } })
    }
    const injected = actions({ roles: () => Promise.resolve({ ok: true, value: TEAM_ROLES }), spawnTeammate: spawn })
    render(<TeamAction {...props(injected)} />)
    await open()
    fireEvent.click(screen.getByRole('button', { name: zh.spawn }))
    expect((await screen.findByRole('alert')).textContent).toContain('spawn transport is down')
    expect(spawn.mock.calls[0]?.[1]).toMatchObject({ role: 'planner' })

    fireEvent.click(screen.getByRole('button', { name: zh.spawn }))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('name is taken')
    })
    // Cancelling clears the draft rather than leaving it half-filled.
    fireEvent.click(screen.getByRole('button', { name: zh.cancel }))
    expect(screen.queryByPlaceholderText(zh.teammatePrompt)).toBeNull()
  })

  it('drops a spawn result that lands after the conversation switches sessions', async () => {
    const late = Promise.withResolvers<TeamSpawnActionResult>()
    const injected = actions({ spawnTeammate: () => late.promise })
    const rendered = render(<TeamAction {...props(injected)} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: zh.addTeammate }))
    fireEvent.click(await screen.findByRole('radio', { name: /reviewer/u }))
    fireEvent.change(screen.getByPlaceholderText(zh.teammatePrompt), { target: { value: 'draft it' } })
    fireEvent.click(screen.getByRole('button', { name: zh.spawn }))

    rendered.rerender(<TeamAction {...props(injected, 'next-session' as SessionId)} />)
    late.resolve(remoteFailure('too late to matter'))
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.queryByText(/too late to matter/u)).toBeNull()
  })

  it('reports every refused peer message and keeps a wakeup delivery', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce(remoteFailure('message transport is down'))
      .mockResolvedValueOnce({
        ok: true,
        value: { ok: false, error: { code: 'team-rejected', message: 'mailbox is full' } },
      })
    render(<TeamAction {...props(actions({ sendMessage: send }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: zh.message }))
    fireEvent.change(screen.getByPlaceholderText(zh.messageText), { target: { value: 'take task-1' } })
    fireEvent.change(screen.getByLabelText(zh.messageText), { target: { value: 'wakeup' } })
    fireEvent.click(screen.getByRole('button', { name: zh.send }))
    expect((await screen.findByRole('alert')).textContent).toContain('message transport is down')
    expect(send.mock.calls[0]?.[1]).toMatchObject({ target: 'worker', delivery: 'wakeup' })

    fireEvent.click(screen.getByRole('button', { name: zh.send }))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('mailbox is full')
    })
    fireEvent.click(screen.getByRole('button', { name: zh.cancel }))
    expect(screen.queryByPlaceholderText(zh.messageText)).toBeNull()
  })

  it('drops a message result that lands after the conversation switches sessions', async () => {
    const late = Promise.withResolvers<TeamMessageActionResult>()
    const injected = actions({ sendMessage: () => late.promise })
    const rendered = render(<TeamAction {...props(injected)} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: zh.message }))
    fireEvent.change(screen.getByPlaceholderText(zh.messageText), { target: { value: 'take task-1' } })
    fireEvent.click(screen.getByRole('button', { name: zh.send }))

    rendered.rerender(<TeamAction {...props(injected, 'next-session' as SessionId)} />)
    late.resolve(remoteFailure('too late to matter'))
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.queryByText(/too late to matter/u)).toBeNull()
  })

  it('reports every refused interrupt', async () => {
    const running: TeamView = {
      ...view,
      members: [
        view.members[0]!,
        { ...view.members[1]!, status: 'running' },
      ],
    }
    const stop = vi.fn()
      .mockResolvedValueOnce(remoteFailure('interrupt transport is down'))
      .mockResolvedValueOnce({
        ok: true,
        value: { ok: false, error: { code: 'team-rejected', message: 'no such teammate' } },
      })
    render(<TeamAction {...props(actions({
      load: () => Promise.resolve({ ok: true, value: running }),
      interrupt: stop,
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    fireEvent.click(screen.getByRole('button', { name: zh.interrupt }))
    expect((await screen.findByRole('alert')).textContent).toContain('interrupt transport is down')
    fireEvent.click(screen.getByRole('button', { name: zh.interrupt }))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('no such teammate')
    })
    expect(stop).toHaveBeenCalledWith(SESSION, 'worker')
  })

  it('drops an interrupt result that lands after the conversation switches sessions', async () => {
    const running: TeamView = {
      ...view,
      members: [view.members[0]!, { ...view.members[1]!, status: 'running' }],
    }
    const late = Promise.withResolvers<TeamInterruptActionResult>()
    const injected = actions({
      load: () => Promise.resolve({ ok: true, value: running }),
      interrupt: () => late.promise,
    })
    const rendered = render(<TeamAction {...props(injected)} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: zh.interrupt }))

    rendered.rerender(<TeamAction {...props(injected, 'next-session' as SessionId)} />)
    late.resolve(remoteFailure('too late to matter'))
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.queryByText(/too late to matter/u)).toBeNull()
  })

  it('closes on Escape, and expands a card by pointer until the pointer leaves', async () => {
    render(<TeamAction {...props(actions())} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    const roster = document.querySelector('[data-team-member-card]')?.parentElement
    if (roster === null || roster === undefined) throw new Error('the roster did not render')
    const card = roster.querySelector('[data-team-member-card]')
    if (card === null) throw new Error('the roster has no cards')
    fireEvent.pointerEnter(card, { pointerType: 'mouse' })
    expect(await screen.findByText(zh.assignedTasks)).toBeTruthy()
    fireEvent.pointerLeave(roster, { pointerType: 'mouse' })
    await waitFor(() => { expect(screen.queryByText(zh.assignedTasks)).toBeNull() })
    // A touch pointer synthesizes no hover, so the card stays collapsed.
    fireEvent.pointerEnter(card, { pointerType: 'touch' })
    expect(screen.queryByText(zh.assignedTasks)).toBeNull()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(screen.queryByText('Implement runtime')).toBeNull() })
  })

  it('confirms a deletion against the task it names', async () => {
    const remove = vi.fn((_session: SessionId, _input: { action: string }) =>
      Promise.resolve(taskSuccess({ ...task, revision: 2, status: 'deleted' })))
    render(<TeamAction {...props(actions({ updateTask: remove }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh.delete, 'u') }))
    const confirm = screen.getByRole('group', { name: `${zh.deleteConfirm}: Implement runtime` })
    fireEvent.click(within(confirm).getByRole('button', { name: new RegExp(zh.delete, 'u') }))
    await waitFor(() => { expect(remove).toHaveBeenCalledOnce() })
    expect(remove.mock.calls[0]?.[1]).toMatchObject({ action: 'delete' })
    await waitFor(() => { expect(screen.queryByRole('group')).toBeNull() })
  })

  it('keeps the expanded card while focus moves inside it, and ignores other keys', async () => {
    render(<TeamAction {...props(actions())} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    const roster = document.querySelector('[data-team-member-card]')?.parentElement
    const card = document.querySelector('[data-team-member-card]')
    if (roster === null || roster === undefined || card === null) throw new Error('the roster did not render')

    fireEvent.focus(card)
    expect(await screen.findByText(zh.assignedTasks)).toBeTruthy()
    // Focus moving between controls of the same card is not leaving it.
    fireEvent.blur(card, { relatedTarget: card.querySelector('button') })
    expect(screen.getByText(zh.assignedTasks)).toBeTruthy()
    // A touch pointer leaving synthesizes no hover change either.
    fireEvent.pointerLeave(roster, { pointerType: 'touch' })
    expect(screen.getByText(zh.assignedTasks)).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Enter' })
    expect(screen.getAllByText('Implement runtime').length).toBeGreaterThan(0)
  })

  it('holds the deletion open when it is refused, and drops it on cancel', async () => {
    const remove = vi.fn(() => Promise.resolve(taskRejected('task is claimed')))
    render(<TeamAction {...props(actions({ updateTask: remove }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh.delete, 'u') }))
    const confirm = screen.getByRole('group', { name: `${zh.deleteConfirm}: Implement runtime` })
    fireEvent.click(within(confirm).getByRole('button', { name: new RegExp(zh.delete, 'u') }))
    await waitFor(() => { expect(remove).toHaveBeenCalledOnce() })
    // A refused delete keeps the confirmation up, so the refusal has somewhere to be read.
    expect(screen.getByRole('group')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group')).getByRole('button', { name: zh.cancel }))
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('keeps quiet delivery as the draft it starts in', async () => {
    const send = vi.fn((_session: SessionId, _request: { delivery: string }) => Promise.resolve({
      ok: true as const, value: { ok: true as const, value: { messageId: 'm' as never, status: 'accepted' as const } },
    }))
    render(<TeamAction {...props(actions({ sendMessage: send }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    fireEvent.click(screen.getByRole('button', { name: zh.message }))
    fireEvent.change(screen.getByPlaceholderText(zh.messageText), { target: { value: 'take task-1' } })
    fireEvent.change(screen.getByLabelText(zh.messageText), { target: { value: 'wakeup' } })
    fireEvent.change(screen.getByLabelText(zh.messageText), { target: { value: 'quiet' } })
    fireEvent.click(screen.getByRole('button', { name: zh.send }))
    await waitFor(() => { expect(send).toHaveBeenCalledOnce() })
    expect(send.mock.calls[0]?.[1]).toMatchObject({ delivery: 'quiet' })
    expect(await screen.findByText(zh.messageQueued)).toBeTruthy()
  })

  it('staffs a teammate from a role and the work, and nothing else', async () => {
    const spawn = vi.fn(() => Promise.resolve(remoteFailure('not reached')))
    render(<TeamAction {...props(actions({ roles: () => Promise.resolve({ ok: true, value: TEAM_ROLES }), spawnTeammate: spawn }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: zh.addTeammate }))

    // Every role the Team offers is on screen with what it is for, rather than
    // hidden behind a control that shows one at a time.
    const choices = await screen.findAllByRole('radio')
    expect(choices.map(choice => choice.textContent)).toEqual(['reviewerReads it back', 'plannerBreaks the work up'])
    // Nothing can be staffed before a role is chosen: the role is what supplies
    // everything the reader is no longer typing.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.spawn }).disabled).toBe(true)

    fireEvent.click(screen.getByRole('radio', { name: /planner/u }))
    // The chosen role says where its teammates run and what history they start
    // from, because both change what the reader is about to get.
    expect(screen.getByText(/big-model/u)).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(zh.teammatePrompt), { target: { value: 'split the migration up' } })
    fireEvent.click(screen.getByRole('button', { name: zh.spawn }))

    await waitFor(() => { expect(spawn).toHaveBeenCalledOnce() })
    // A role and the work: no name, no label, and no context mode were typed.
    expect(spawn.mock.calls[0]?.[1]).toEqual({ role: 'planner', prompt: 'split the migration up' })
  })

  it('sends a name only when the reader overrides the one the role would derive', async () => {
    const spawn = vi.fn(() => Promise.resolve(remoteFailure('not reached')))
    render(<TeamAction {...props(actions({ roles: () => Promise.resolve({ ok: true, value: TEAM_ROLES }), spawnTeammate: spawn }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: zh.addTeammate }))
    fireEvent.click(await screen.findByRole('radio', { name: /reviewer/u }))
    fireEvent.change(screen.getByPlaceholderText(zh.teammatePrompt), { target: { value: 'read it' } })
    fireEvent.change(screen.getByPlaceholderText('名称（留空则为 reviewer）'), { target: { value: 'security-pass' } })
    fireEvent.click(screen.getByRole('button', { name: zh.spawn }))

    await waitFor(() => { expect(spawn).toHaveBeenCalledOnce() })
    expect(spawn.mock.calls[0]?.[1]).toEqual({ role: 'reviewer', name: 'security-pass', prompt: 'read it' })
  })

  it('says so when a Team offers no roles at all', async () => {
    render(<TeamAction {...props(actions({ roles: () => Promise.resolve({ ok: true, value: [] }) }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: zh.addTeammate }))
    expect(await screen.findByText(zh.noRoles)).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.spawn }).disabled).toBe(true)
  })

  it('stops following when the surface closes', async () => {
    const stop = vi.fn()
    const load = vi.fn(() => Promise.resolve({ ok: true as const, value: view }))
    render(<TeamAction {...props(actions({ load, follow: () => stop }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    expect(stop).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(screen.queryByText('Implement runtime')).toBeNull() })
    // Closing ends the follow rather than leaving one outstanding on the Host.
    expect(stop).toHaveBeenCalledOnce()
  })

  it('names what a member has spent, and omits cache it was never served', async () => {
    const spent: TeamView = {
      ...view,
      members: [
        {
          ...view.members[0]!,
          effort: {
            turns: 3, modelMs: 12_400, toolMs: 1100,
            inputTokens: 18_200, outputTokens: 2400, cacheReadTokens: 96_000,
          },
        },
        {
          ...view.members[1]!,
          effort: {
            turns: 1, modelMs: 185_000, toolMs: 0,
            inputTokens: 900, outputTokens: 1_200_000, cacheReadTokens: 0,
          },
        },
      ],
    }
    render(<TeamAction {...props(actions({ load: () => Promise.resolve({ ok: true, value: spent }) }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    const cards = [...document.querySelectorAll('[data-team-member-card]')]
    fireEvent.focus(cards[0]!)
    const lead = await screen.findByText((_text, node) => node?.matches('[data-team-effort]') ?? false)
    // Each unit is rounded to the largest one that still reads as a measurement.
    expect(lead.textContent).toContain(zh.effortTurns.replace('{turns}', '3'))
    expect(lead.textContent).toContain(zh.unitSeconds.replace('{value}', '12.4'))
    expect(lead.textContent).toContain(zh.unitSeconds.replace('{value}', '1.1'))
    expect(lead.textContent).toContain('18.2K')
    expect(lead.textContent).toContain('2.4K')
    expect(lead.textContent).toContain('96.0K')

    fireEvent.blur(cards[0]!)
    fireEvent.focus(cards[1]!)
    await waitFor(() => {
      const worker = document.querySelector('[data-team-effort]')
      // Past a minute the reading switches to minutes and seconds.
      expect(worker?.textContent).toContain(
        zh.unitMinutes.replace('{minutes}', '3').replace('{seconds}', '5'),
      )
      expect(worker?.textContent).toContain(zh.unitMs.replace('{value}', '0'))
      expect(worker?.textContent).toContain('1.2M')
      // Nothing was served from cache, so the card does not claim a zero.
      expect(worker?.textContent).not.toContain(zh.effortCached.replace('{cached}', ''))
    })
  })

  it('reads a member with no reported effort without inventing one', async () => {
    render(<TeamAction {...props(actions())} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.focus(document.querySelector('[data-team-member-card]')!)
    expect(await screen.findByText(zh.assignedTasks)).toBeTruthy()
    expect(document.querySelector('[data-team-effort]')).toBeNull()
  })

  it('tails the expanded member and drops the tail when the card collapses', async () => {
    const lines: TeamTailLine[] = [
      { seq: 9, time: 0, kind: 'tool-result', text: 'wrote a.ts' },
      { seq: 8, time: 0, kind: 'tool', name: 'write', text: '{"filePath":"a.ts"}' },
      { seq: 7, time: 0, kind: 'assistant', text: 'x'.repeat(20), truncated: true },
    ]
    const tail = vi.fn((_session: SessionId, _member: string, _limit: number) =>
      Promise.resolve({ ok: true as const, value: lines }))
    render(<TeamAction {...props(actions({ tail }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    expect(document.querySelector('[data-team-tail]')).toBeNull()

    const worker = document.querySelector('[data-team-member-card="worker-id"]')
    if (worker === null) throw new Error('the roster did not render the teammate')
    fireEvent.focus(worker)

    const recorded = await screen.findByText((_text, node) => node?.matches('[data-team-tail]') ?? false)
    const rows = [...recorded.children].map(row => row.textContent ?? '')
    expect(rows[0]).toContain('wrote a.ts')
    expect(rows[1]).toContain(zh.tailTool.replace('{name}', 'write'))
    // A line the service cut says so rather than pretending it is complete.
    expect(rows[2]).toContain(zh.tailTruncated)
    expect(tail).toHaveBeenCalledWith(SESSION, 'worker', 6)

    fireEvent.blur(worker)
    await waitFor(() => { expect(document.querySelector('[data-team-tail]')).toBeNull() })
  })

  it('says so when a member has recorded nothing, and ignores a refused tail', async () => {
    const empty = await (async () => {
      const rendered = render(<TeamAction {...props(actions())} />)
      fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
      await screen.findByText('Implement runtime')
      fireEvent.focus(document.querySelector('[data-team-member-card]')!)
      expect(await screen.findByText(zh.tailEmpty)).toBeTruthy()
      return rendered
    })()
    empty.unmount()

    render(<TeamAction {...props(actions({ tail: () => Promise.resolve(remoteFailure('no tail')) }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.focus(document.querySelector('[data-team-member-card]')!)
    // A refused tail leaves the card's other detail alone.
    expect(await screen.findByText(zh.assignedTasks)).toBeTruthy()
    expect(screen.getByText(zh.tailEmpty)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('marks only a working member\'s glyph, so motion on the roster means work', async () => {
    const busy: TeamView = {
      ...view,
      members: [
        { ...view.members[0]!, status: 'running' },
        { ...view.members[1]!, status: 'provisioning' },
        { id: 'idle-id' as SessionId, name: 'reader', role: 'teammate', status: 'idle', pendingMessages: 0, diagnostics: [] },
        { id: 'gone-id' as SessionId, name: 'ghost', role: 'teammate', status: 'failed', pendingMessages: 0, diagnostics: [] },
      ],
    }
    render(<TeamAction {...props(actions({ load: () => Promise.resolve({ ok: true, value: busy }) }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    const marked = [...document.querySelectorAll('[data-team-member-card]')]
      .map(card => card.querySelector('[data-team-member-working]') !== null)
    // Running and provisioning members are working; idle and failed are not.
    expect(marked).toEqual([true, true, false, false])
  })

  it('marks a member by the role its name states, not by a portrait', async () => {
    const named: TeamView = {
      ...view,
      members: [
        view.members[0]!,
        { ...view.members[1]!, name: 'code-reviewer' },
        { id: 'solo-id' as SessionId, name: 'q', role: 'teammate', status: 'idle', pendingMessages: 0, diagnostics: [] },
      ],
    }
    render(<TeamAction {...props(actions({ load: () => Promise.resolve({ ok: true, value: named }) }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    const marks = [...document.querySelectorAll('[data-team-member-card]')]
      .map(card => card.querySelector('[class*="memberMonogram"]')?.textContent)
    // One letter per word, at most two; a single-character name still reads.
    expect(marks).toEqual(['L', 'CR', 'Q'])
  })

  it('never animates a timeline row, because every row already happened', async () => {
    const history: TeamActivityEntry[] = [
      { seq: 4, time: 0, kind: 'message-delivered', subject: 'lead', target: 'writer' },
      { seq: 3, time: 0, kind: 'task', subject: 'Implement runtime', state: 'completed' },
      { seq: 2, time: 0, kind: 'member', subject: 'ghost', state: 'failed' },
      { seq: 1, time: 0, kind: 'task', subject: 'Implement runtime', state: 'pending' },
    ]
    render(<TeamAction {...props(actions({
      activity: () => Promise.resolve({ ok: true, value: history }),
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    const rows = document.querySelector('[data-team-activity]')
    if (rows === null) throw new Error('the timeline did not render')
    expect([...rows.children].map(row => row.querySelector('[data-activity-mark]')?.getAttribute('data-activity-mark')))
      .toEqual(['settled', 'settled', 'failed', 'recorded'])
    // The live pixel-chase marker belongs to state that is still moving.
    expect(rows.querySelector('[data-state="ongoing"]')).toBeNull()
  })

  it('builds a task from the board rather than from typed ids and lists', async () => {
    const createTask = vi.fn((_session: SessionId, _input: {
      subject: string
      blockedBy: readonly TeamTaskId[]
      writeScopes: readonly string[]
    }) => Promise.resolve(taskSuccess({ ...task, id: TASK_2 })))
    render(<TeamAction {...props(actions({
      load: () => Promise.resolve({ ok: true, value: pairedView }),
      createTask,
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Wired task' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: 'Details' } })

    // A blocker is chosen and unchosen by its subject.
    pickBlocker('Implement runtime')
    pickBlocker('Publish the notes')
    pickBlocker('Implement runtime')

    // A scope is added by Enter as well as by the button, and removed as a chip.
    const entry = screen.getByPlaceholderText(zh.scopesHint)
    fireEvent.change(entry, { target: { value: 'src/kept' } })
    fireEvent.keyDown(entry, { key: 'Enter' })
    fireEvent.change(entry, { target: { value: 'src/dropped' } })
    fireEvent.keyDown(entry, { key: 'a' })
    fireEvent.keyDown(entry, { key: 'Enter' })
    // Blank input adds nothing, by either route.
    fireEvent.keyDown(entry, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: zh.scopeRemove.replace('{scope}', 'src/dropped') }))

    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => { expect(createTask).toHaveBeenCalledOnce() })
    expect(createTask.mock.calls[0]?.[1]).toMatchObject({
      subject: 'Wired task',
      blockedBy: [TASK_2],
      writeScopes: ['src/kept'],
    })
  })

  it('names a member\'s undelivered mail and says why it is still waiting', async () => {
    const waiting: TeamView = {
      ...view,
      members: [
        view.members[0]!,
        { ...view.members[1]!, pendingMessages: 2 },
      ],
    }
    render(<TeamAction {...props(actions({
      load: () => Promise.resolve({ ok: true, value: waiting }),
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    // The Lead has none, so its card says nothing about mail.
    const cards = [...document.querySelectorAll('[data-team-member-card]')]
    fireEvent.focus(cards[0]!)
    expect(await screen.findByText(zh.assignedTasks)).toBeTruthy()
    expect(screen.queryByText(zh.pendingMailHint)).toBeNull()

    // The teammate's card names the backlog and what to do about it.
    fireEvent.blur(cards[0]!)
    fireEvent.focus(cards[1]!)
    expect(await screen.findByText(zh.pendingMail.replace('{count}', '2'))).toBeTruthy()
    expect(screen.getByText(zh.pendingMailHint)).toBeTruthy()
  })
})
