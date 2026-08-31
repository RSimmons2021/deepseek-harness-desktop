// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  TeamTaskId, TeamTaskView as TeamTask, TeamView,
} from '@deepseek-ai/dsh-experimental-agent-team/client'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import {
  TeamAction, type TeamActionInjected, type TeamActionProps, type TeamActionResult,
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
const view: TeamView = {
  members: [
    { id: SESSION, name: 'lead', role: 'lead', status: 'idle', model: 'model-a', diagnostics: [] },
    {
      id: 'worker-id' as SessionId,
      name: 'worker',
      role: 'teammate',
      status: 'inactive',
      model: 'model-a',
      diagnostics: [],
    },
  ],
  tasks: [task],
  capacity: 8,
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
    // Default fixture never reports a change, so the follow loop parks on its
    // first wait instead of reloading underneath the assertions.
    waitForChange: () => new Promise(() => {}),
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
      members: [{ id: nextSession, name: 'lead', role: 'lead', status: 'idle', diagnostics: [] }],
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

  it('loads roster/task diagnostics on open and navigates a healthy teammate', async () => {
    const openTeammate = vi.fn(() => Promise.resolve())
    render(<TeamAction {...props(actions({ openTeammate }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    const worker = await screen.findByRole('button', { name: /worker/u })
    expect(screen.getByText('write scopes overlap with task-2')).toBeTruthy()
    fireEvent.click(worker)
    await waitFor(() => { expect(openTeammate).toHaveBeenCalledWith(SESSION, view.members[1]) })
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
            diagnostics: [],
          },
        },
      },
    }))
    render(<TeamAction {...props(actions({ load, spawnTeammate }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))

    const add = await screen.findByRole('button', { name: new RegExp(zh.addTeammate, 'u') })
    fireEvent.click(add)
    fireEvent.change(screen.getByPlaceholderText(zh.teammateName), { target: { value: 'writer' } })
    fireEvent.change(screen.getByPlaceholderText(zh.teammateDescription), { target: { value: 'drafts copy' } })
    fireEvent.change(screen.getByPlaceholderText(zh.teammatePrompt), { target: { value: 'draft the release note' } })
    fireEvent.click(screen.getByRole('button', { name: zh.spawn }))

    await waitFor(() => {
      expect(spawnTeammate).toHaveBeenCalledWith(SESSION, {
        name: 'writer',
        description: 'drafts copy',
        prompt: 'draft the release note',
        context: 'fresh',
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

  it('reloads when the live wait observes a change and stops after a transport failure', async () => {
    const load = vi.fn(() => Promise.resolve({ ok: true as const, value: view }))
    const waitForChange = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: { timedOut: false } })
      .mockResolvedValueOnce({ ok: true, value: { timedOut: true } })
      .mockResolvedValueOnce(remoteFailure('gateway closed'))
    render(<TeamAction {...props(actions({ load, waitForChange }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))

    // One observed change reloads; the timeout re-enters the wait; the failure
    // ends the loop, so the wait count settles instead of spinning.
    await waitFor(() => { expect(load).toHaveBeenCalledTimes(2) })
    await waitFor(() => { expect(waitForChange).toHaveBeenCalledTimes(3) })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(waitForChange).toHaveBeenCalledTimes(3)
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
    fireEvent.change(screen.getByPlaceholderText(/依赖任务/u), { target: { value: 'task-1, task-1' } })
    fireEvent.change(screen.getByPlaceholderText(/写入范围/u), { target: { value: 'src/a, src/b' } })
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
      value: { ...view, tasks: current.status === 'deleted' ? [] : [current] },
    }))
    render(<TeamAction {...props(actions({ load, updateTask }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'worker' } })
    await waitFor(() => {
      expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('worker')
      expect(current).toMatchObject({ revision: 2, ownerName: 'worker' })
    })

    fireEvent.click(screen.getByRole('button', { name: /编辑/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Updated runtime' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: 'Updated details' } })
    fireEvent.change(screen.getByPlaceholderText(/依赖任务/u), { target: { value: 'task-0' } })
    fireEvent.change(screen.getByPlaceholderText(/写入范围/u), { target: { value: 'src/runtime' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('Updated runtime')).toBeTruthy()
    expect(current).toMatchObject({
      revision: 4,
      description: 'Updated details',
      blockedBy: ['task-0'],
      writeScopes: ['src/runtime'],
    })

    fireEvent.click(screen.getByRole('button', { name: /完成/u }))
    fireEvent.click(await screen.findByRole('button', { name: /重开/u }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /重开/u })).toBeNull()
      expect(current).toMatchObject({ revision: 6, status: 'pending' })
    })
    fireEvent.click(screen.getByRole('button', { name: /删除/u }))
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
      .mockResolvedValueOnce({ ok: true, value: view })
      .mockResolvedValueOnce({ ok: true, value: { ...view, tasks: [{ ...task, revision: 2, subject: 'Edited' }] } })
      .mockResolvedValueOnce(remoteFailure('dependency reload failed'))
    const dependencyUpdate = vi.fn()
      .mockResolvedValueOnce(taskSuccess({ ...task, revision: 2, subject: 'Edited' }))
      .mockResolvedValueOnce(taskConflict('stale dependency'))
    render(<TeamAction {...props(actions({ load: dependencyLoad, updateTask: dependencyUpdate }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /编辑/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Edited' } })
    fireEvent.change(screen.getByPlaceholderText(zh.blockers), { target: { value: 'task-2' } })
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
          diagnostics: ['provider failed'],
        },
        {
          id: 'provisioning-id' as SessionId,
          name: 'provisioning-worker',
          role: 'teammate',
          status: 'provisioning',
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
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /failed-worker/u }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /provisioning-worker/u }).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /^worker运行中/u }))
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
    render(<TeamAction {...props(actions({ updateTask }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')

    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByPlaceholderText('任务标题')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /编辑/u }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /编辑/u }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('edit failed (internal)')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Saved edit' } })
    fireEvent.change(screen.getByPlaceholderText(zh.blockers), { target: { value: 'task-2' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('dependency failed (team-rejected)')).toBeTruthy()
    expect(updateTask.mock.calls[2]?.[1]).toMatchObject({
      action: 'set_dependencies',
      expectedRevision: 2,
      blockedBy: ['task-2'],
    })

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
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
    render(<TeamAction {...props(actions({ updateTask }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /编辑/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Edited' } })
    fireEvent.change(screen.getByPlaceholderText(zh.blockers), { target: { value: 'task-2' } })
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
      .mockResolvedValueOnce({ ok: true, value: view })
      .mockResolvedValueOnce({ ok: true, value: { ...view, tasks: [{ ...task, revision: 2, subject: 'Conflict edit' }] } })
      .mockResolvedValueOnce({ ok: true, value: { ...view, tasks: [{ ...task, revision: 3 }] } })
    const conflictUpdate = vi.fn()
      .mockResolvedValueOnce(taskSuccess({ ...task, revision: 2, subject: 'Conflict edit' }))
      .mockResolvedValueOnce(taskConflict('stale dependency'))
    const first = render(<TeamAction {...props(actions({ load, updateTask: conflictUpdate }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /编辑/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Conflict edit' } })
    fireEvent.change(screen.getByPlaceholderText(zh.blockers), { target: { value: 'task-2' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText(zh.conflict)).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(3)
    first.unmount()

    const dependencyReload = Promise.withResolvers<TeamActionResult<TeamView>>()
    const dependencyLoad = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: view })
      .mockResolvedValueOnce({ ok: true, value: { ...view, tasks: [{ ...task, revision: 2, subject: 'Late edit' }] } })
      .mockImplementationOnce(() => dependencyReload.promise)
    const staleUpdate = vi.fn()
      .mockResolvedValueOnce(taskSuccess({ ...task, revision: 2, subject: 'Late edit' }))
      .mockResolvedValueOnce(taskConflict('stale dependency'))
    const second = render(<TeamAction {...props(actions({ load: dependencyLoad, updateTask: staleUpdate }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /编辑/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Late edit' } })
    fireEvent.change(screen.getByPlaceholderText(zh.blockers), { target: { value: 'task-2' } })
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
    const third = render(<TeamAction {...props(actions({ updateTask: lateUpdate }))} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Team/u }))
    await screen.findByText('Implement runtime')
    fireEvent.click(screen.getByRole('button', { name: /编辑/u }))
    fireEvent.change(screen.getByPlaceholderText('任务标题'), { target: { value: 'Late edit' } })
    fireEvent.change(screen.getByPlaceholderText(zh.blockers), { target: { value: 'task-2' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => { expect(lateUpdate).toHaveBeenCalledTimes(2) })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.savingTask }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '取消' }).disabled).toBe(true)
    third.rerender(<TeamAction {...props(actions(), 'next-session' as SessionId)} />)
    dependency.resolve(taskSuccess({ ...task, revision: 3, subject: 'Late dependency' }))
    await Promise.resolve()
    expect(screen.queryByText('Late dependency')).toBeNull()
  })
})
