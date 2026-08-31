import { Context, Service } from '@deepseek-ai/cordis'
import { RemoteStream } from '@deepseek-ai/dsh-api-gateway/client'
import type { RemoteStreamOptions } from '@deepseek-ai/dsh-api-gateway/client'
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { TeamMemberView as TeamRosterMember, TeamTaskId } from '@deepseek-ai/dsh-experimental-agent-team/client'
import type {} from '@deepseek-ai/dsh-experimental-agent-team/remote'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { TeamAction, type TeamActionInjected } from '../src/client/TeamAction.tsx'
import { inject, mountAgentTeamUi } from '../src/client/mount.ts'
import { apply as nodeApply } from '../src/index.ts'

const SESSION = 'team-session' as SessionId
const CHILD = 'team-child' as SessionId
const TASK_ID = 'task-1' as TeamTaskId
const REMOTE: TypertRemoteContribution = {
  package: '@deepseek-ai/dsh-experimental-agent-team',
  descriptors: [],
}

async function bench(options: {
  addressed?: boolean
  followFrames?: () => AsyncIterable<unknown>
  colorScheme?: 'light' | 'dark'
  preference?: string
  conflict?: boolean
  registrationFailure?: boolean
  remoteFailure?: 'view' | 'update'
  refreshGate?: Promise<void>
} = {}) {
  const ctx = new Context()
  const calls: { method: string; args: unknown[] }[] = []
  const answer = <T>(method: string, value: T) => (...args: unknown[]) => {
    calls.push({ method, args })
    return Promise.resolve({ ok: true as const, value })
  }
  const task = {
    id: 'task-1',
    revision: 1, subject: 'Task', description: 'Description', status: 'pending' as const,
    blockedBy: [], writeScopes: [], ready: true, writeScopeWarnings: [],
  }
  class RemoteService extends Service {
    readonly disposeMount = vi.fn(() => Promise.resolve())
    readonly mount = vi.fn((_contribution: unknown) => Promise.resolve(this.disposeMount))

    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }

    $mount(contribution: unknown): Promise<() => Promise<void>> {
      return this.mount(contribution)
    }
  }
  const remote = new RemoteService(ctx)
  // The Gateway's own reconnecting stream over a connection that is always
  // available: the plugin's follow binding is exercised as it actually runs.
  const connection = {
    generation: { getSnapshot: () => ({ id: 1, host: { home: '/h' } }), subscribe: () => () => {} },
  }
  ctx.remote.$stream = <Item>(streamOptions: RemoteStreamOptions<Item>) => (
    new RemoteStream(connection, streamOptions)
  )
  const failure = {
    ok: false as const,
    error: { code: 'internal', message: 'offline', details: {} },
  }
  const view = {
    members: [{
      id: SESSION, name: 'lead', role: 'lead' as const, status: 'idle' as const, diagnostics: [],
    }], tasks: [task],
  }
  ctx.provide('remote.agentTeams', {
    follow: (...args: unknown[]) => {
      calls.push({ method: 'agentTeams/follow', args })
      return options.followFrames?.() ?? (async function* empty() { await Promise.resolve() })()
    },
    view: (...args: unknown[]) => {
      calls.push({ method: 'agentTeams/view', args })
      return Promise.resolve(options.remoteFailure === 'view'
        ? failure
        : { ok: true as const, value: view })
    },
    createTask: answer('agentTeams/createTask', task),
    spawnTeammate: answer('agentTeams/spawnTeammate', { ok: true, value: { member: view.members[0] } }),
    sendMessage: answer('agentTeams/sendMessage', { ok: true, value: { messageId: 'm-1', status: 'accepted' } }),
    activity: answer('agentTeams/activity', []),
    tail: answer('agentTeams/tail', []),
    interrupt: answer('agentTeams/interrupt', { ok: true, value: { previousStatus: 'running' } }),
    updateTask: (...args: unknown[]) => {
      calls.push({ method: 'agentTeams/updateTask', args })
      if (options.remoteFailure === 'update') return Promise.resolve(failure)
      return Promise.resolve(options.conflict
        ? {
          ok: true as const,
          value: {
            ok: false as const,
            error: {
              code: 'team-task-conflict' as const,
              message: 'stale',
            },
          },
        }
        : { ok: true as const, value: { ok: true as const, value: { ...task, revision: 2 } } })
    },
  })
  const navigation: unknown[] = []
  let current = options.addressed === true ? CHILD : SESSION
  ctx.provide('sessions', {
    list: { getSnapshot: () => ({ current }) },
    binding: (id: SessionId) => options.addressed === true && id === CHILD
      ? { session: { getSnapshot: () => ({
        subagent: {
          address: {
            parentSessionId: SESSION,
            childSessionId: CHILD,
            mode: 'continuable' as const,
          },
        },
      }) } }
      : undefined,
    refreshSubagents: (id: SessionId) => {
      navigation.push(['refresh', id])
      return options.refreshGate ?? Promise.resolve()
    },
    openSubagent: (address: unknown) => { navigation.push(['open', address]) },
  })
  ctx.provide('conversation', {})
  ctx.provide('uiSession', {} as never)
  let scheme: 'light' | 'dark' = options.colorScheme ?? 'dark'
  ctx.provide('theme', {
    getTheme: () => ({ active: { colorScheme: scheme }, preference: options.preference ?? 'dark' }),
    setTheme: (id: 'light' | 'dark') => { scheme = id; navigation.push(['theme', id]) },
  } as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry).await()
  const collapseHeader = ctx.slots.register({
    name: 'root',
    children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } },
  } as never, () => null)
  if (options.registrationFailure === true) {
    vi.spyOn(ctx.slots, 'inject').mockImplementationOnce(() => { throw new Error('slot registration failed') })
  }
  const fiber = options.registrationFailure === true
    ? ctx.plugin({ apply() {} })
    : ctx.plugin({ inject: [...inject], apply: clientCtx => mountAgentTeamUi(clientCtx, REMOTE) })
  const activation: Promise<unknown> = options.registrationFailure === true
    ? mountAgentTeamUi(ctx, REMOTE).catch((error: unknown) => error)
    : fiber.await()
  if (options.registrationFailure !== true) {
    await activation
  } else {
    await fiber.await()
  }
  const entry = () => ctx.slots.entries('conversation.session.header.actions')
    .find(candidate => candidate.component === TeamAction)
  return {
    ctx,
    fiber,
    activation,
    calls,
    navigation,
    remote,
    entry,
    collapseHeader,
    select: (sessionId: SessionId) => { current = sessionId },
  }
}

describe('ui-team browser plugin', () => {
  it('registers one disposable header action with RPC-backed task operations', async () => {
    const b = await bench()
    expect(inject).toEqual(['sessions', 'remote', 'slots', 'locale', 'uiSession', 'theme'])
    expect(b.entry()).toMatchObject({
      options: { id: 'agent-team', order: 20 },
      locale: 'agent-team',
    })
    expect(b.remote.mount).toHaveBeenCalledOnce()
    expect(b.remote.mount).toHaveBeenCalledWith(REMOTE)
    const actions = (b.entry()!.inject as unknown as () => TeamActionInjected)()
    expect((await actions.load(SESSION)).ok).toBe(true)
    expect((await actions.createTask(SESSION, {
      subject: 'Task', description: 'Description', blockedBy: [], writeScopes: [],
    })).ok).toBe(true)
    expect((await actions.updateTask(SESSION, {
      taskId: TASK_ID, expectedRevision: 1, action: 'complete',
    })).ok).toBe(true)
    expect((await actions.updateTask(SESSION, {
      taskId: TASK_ID, expectedRevision: 2, action: 'reassign', owner: 'worker',
    })).ok).toBe(true)
    expect(b.calls.map(call => call.method)).toEqual([
      'agentTeams/view', 'agentTeams/createTask', 'agentTeams/updateTask', 'agentTeams/updateTask',
    ])
    expect(b.calls.at(-1)?.args[1]).toMatchObject({ owner: 'worker' })

    await actions.openTeammate(SESSION, {
      id: SESSION,
      name: 'lead',
      role: 'lead',
      status: 'idle',
      diagnostics: [],
    })
    expect(b.navigation).toEqual([])

    await b.fiber.dispose()
    expect(b.entry()).toBeUndefined()
    expect(b.remote.disposeMount).toHaveBeenCalledOnce()
  })

  it('unmounts the Remote contribution when later Client registration fails', async () => {
    const b = await bench({ registrationFailure: true })
    await expect(b.activation).resolves.toMatchObject({ message: 'slot registration failed' })
    expect(b.remote.mount).toHaveBeenCalledOnce()
    expect(b.remote.disposeMount).toHaveBeenCalledOnce()
  })

  it('returns the generated task business result without a Client transport wrapper', async () => {
    const b = await bench({ conflict: true })
    const actions = (b.entry()!.inject as unknown as () => TeamActionInjected)()
    await expect(actions.updateTask(SESSION, {
      taskId: TASK_ID, expectedRevision: 1, action: 'delete',
    })).resolves.toEqual({
      ok: true,
      value: {
        ok: false,
        error: { code: 'team-task-conflict', message: 'stale' },
      },
    })
  })

  it('returns Remote carrier failures unchanged', async () => {
    const view = await bench({ remoteFailure: 'view' })
    const viewActions = (view.entry()!.inject as unknown as () => TeamActionInjected)()
    await expect(viewActions.load(SESSION)).resolves.toEqual({
      ok: false,
      error: { code: 'internal', message: 'offline', details: {} },
    })

    const update = await bench({ remoteFailure: 'update' })
    const updateActions = (update.entry()!.inject as unknown as () => TeamActionInjected)()
    await expect(updateActions.updateTask(SESSION, {
      taskId: TASK_ID, expectedRevision: 1, action: 'delete',
    })).resolves.toEqual({
      ok: false,
      error: { code: 'internal', message: 'offline', details: {} },
    })
  })

  it('refreshes the descriptor catalog before opening a continuable teammate address', async () => {
    const b = await bench()
    const actions = (b.entry()!.inject as unknown as () => TeamActionInjected)()
    const member: TeamRosterMember = {
      id: CHILD,
      name: 'worker',
      role: 'teammate',
      status: 'inactive',
      diagnostics: [],
    }
    await actions.openTeammate(SESSION, member)
    expect(b.navigation).toEqual([
      ['refresh', SESSION],
      ['open', {
        parentSessionId: SESSION,
        childSessionId: CHILD,
        mode: 'continuable',
      }],
    ])
  })

  it('routes Team actions from an addressed teammate conversation back through its Lead', async () => {
    const b = await bench({ addressed: true })
    const actions = (b.entry()!.inject as unknown as () => TeamActionInjected)()
    await actions.load(CHILD)
    await actions.openTeammate(CHILD, {
      id: CHILD,
      name: 'worker',
      role: 'teammate',
      status: 'inactive',
      diagnostics: [],
    })
    expect(b.calls[0]).toEqual({ method: 'agentTeams/view', args: [SESSION] })
    expect(b.navigation).toEqual([
      ['refresh', SESSION],
      ['open', {
        parentSessionId: SESSION,
        childSessionId: CHILD,
        mode: 'continuable',
      }],
    ])
  })

  it('does not open a teammate after navigation switches during catalog refresh', async () => {
    const refresh = Promise.withResolvers<undefined>()
    const b = await bench({ refreshGate: refresh.promise })
    const actions = (b.entry()!.inject as unknown as () => TeamActionInjected)()
    const opening = actions.openTeammate(SESSION, {
      id: CHILD,
      name: 'worker',
      role: 'teammate',
      status: 'inactive',
      diagnostics: [],
    })
    expect(b.navigation).toEqual([['refresh', SESSION]])
    b.select('other-session' as SessionId)
    refresh.resolve(undefined)
    await opening
    expect(b.navigation).toEqual([['refresh', SESSION]])
  })

  it('re-registers after the conversation header slot is collapsed and declared again', async () => {
    const b = await bench()
    expect(b.entry()).toBeDefined()
    b.collapseHeader()
    expect(b.entry()).toBeUndefined()
    b.ctx.slots.register({
      name: 'root',
      children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } },
    } as never, () => null)
    await Promise.resolve()
    expect(b.entry()).toBeDefined()
  })

  it('keeps the node half inert', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('routes every remaining Team action through the Lead Session', async () => {
    const b = await bench({ addressed: true })
    const actions = (b.entry()!.inject as unknown as () => TeamActionInjected)()

    await actions.spawnTeammate(CHILD, {
      name: 'writer', description: 'writes', prompt: 'draft it', context: 'fresh',
    })
    await actions.sendMessage(CHILD, { target: 'writer', message: 'take it', delivery: 'quiet' })
    await actions.activity(CHILD, 40)
    await actions.tail(CHILD, 'writer', 6)
    await actions.interrupt(CHILD, 'writer')

    expect(b.calls.map(call => call.method)).toEqual([
      'agentTeams/spawnTeammate', 'agentTeams/sendMessage', 'agentTeams/activity',
      'agentTeams/tail', 'agentTeams/interrupt',
    ])
    // Every one addresses the Lead, never the teammate conversation it was called from.
    expect(b.calls.every(call => call.args[0] === SESSION)).toBe(true)
    expect(b.calls.find(call => call.method === 'agentTeams/activity')?.args[1]).toBe(40)
  })

  it('reads the resolved appearance and writes the opposite one', async () => {
    const b = await bench({ colorScheme: 'dark' })
    const actions = (b.entry()!.inject as unknown as () => TeamActionInjected)()
    expect(actions.hooks.colorScheme.getSnapshot()).toBe('dark')

    const changes: number[] = []
    const stop = actions.hooks.colorScheme.subscribe(() => { changes.push(changes.length) })
    actions.toggleTheme()
    expect(actions.hooks.colorScheme.getSnapshot()).toBe('light')
    actions.toggleTheme()
    expect(actions.hooks.colorScheme.getSnapshot()).toBe('dark')
    expect(b.navigation).toEqual([['theme', 'light'], ['theme', 'dark']])

    b.ctx.emit('theme/change', undefined as never)
    expect(changes).toHaveLength(1)
    stop()
    b.ctx.emit('theme/change', undefined as never)
    expect(changes).toHaveLength(1)
  })

  it('follows the Team through the Gateway stream and disposes it on demand', async () => {
    const empty = { members: [], tasks: [], capacity: 8 }
    const frames = [
      { type: 'baseline', view: empty },
      { type: 'update', view: { ...empty, tasks: [{ id: 'task-1' }] } },
    ]
    const b = await bench({
      addressed: true,
      followFrames: () => (async function* emit() {
        for (const frame of frames) yield await Promise.resolve(frame)
        // Park: a real follow ends when its carrier is cancelled, not by
        // running out of frames.
        await new Promise(() => {})
      })(),
    })
    const actions = (b.entry()!.inject as unknown as () => TeamActionInjected)()

    const seen: unknown[] = []
    const failures: unknown[] = []
    const stop = actions.follow(CHILD, (view) => { seen.push(view) }, (error) => { failures.push(error) })
    await vi.waitFor(() => { expect(seen).toHaveLength(2) })

    // The opening frame and every later one are taken the same way, and the
    // follow addresses the Lead rather than the teammate conversation.
    expect(seen[0]).toMatchObject({ tasks: [] })
    expect(seen[1]).toMatchObject({ tasks: [{ id: 'task-1' }] })
    expect(failures).toEqual([])
    expect(b.calls.find(call => call.method === 'agentTeams/follow')?.args[0]).toBe(SESSION)

    stop()
  })

  it('classifies a follow that ends after its opening view and one that ends before', async () => {
    const opened = await bench({
      followFrames: () => (async function* once() {
        yield await Promise.resolve({ type: 'baseline', view: { members: [], tasks: [], capacity: 8 } })
      })(),
    })
    const openedFailures: unknown[] = []
    const openedActions = (opened.entry()!.inject as unknown as () => TeamActionInjected)()
    openedActions.follow(SESSION, () => {}, (error) => { openedFailures.push(error) })
    await vi.waitFor(() => { expect(openedFailures).toHaveLength(1) })
    expect(String(openedFailures[0])).toContain('ended without a terminal result')

    const silent = await bench({
      followFrames: () => (async function* nothing() { await Promise.resolve() })(),
    })
    const silentFailures: unknown[] = []
    const silentActions = (silent.entry()!.inject as unknown as () => TeamActionInjected)()
    silentActions.follow(SESSION, () => {}, (error) => { silentFailures.push(error) })
    await vi.waitFor(() => { expect(silentFailures).toHaveLength(1) })
    expect(String(silentFailures[0])).toContain('ended before its opening view')
  })
})
