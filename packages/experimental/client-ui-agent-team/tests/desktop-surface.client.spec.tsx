// @vitest-environment jsdom

/**
 * The desktop branch of the browser registration: it claims `desktop.root`
 * instead of the conversation header, resolves the default appearance once,
 * and enters a Session before the workspace mounts.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { DesktopTeamRoot, type DesktopTeamRootInjected } from '../src/client/DesktopTeamRoot.tsx'
import { mountAgentTeamUi } from '../src/client/mount.ts'

const SESSION = 'lead' as SessionId
const REMOTE: TypertRemoteContribution = {
  package: '@deepseek-ai/dsh-experimental-agent-team',
  descriptors: [],
}

afterEach(() => { vi.unstubAllGlobals() })

async function bench(options: {
  surface?: 'user-agent' | 'query' | 'browser'
  preference?: string
  ids?: SessionId[]
  current?: SessionId
} = {}) {
  const surface = options.surface ?? 'user-agent'
  vi.stubGlobal('navigator', {
    language: 'zh-CN',
    languages: ['zh-CN'],
    userAgent: surface === 'user-agent' ? 'Chrome DeepSeekHarnessDesktop/1' : 'Chrome',
  })
  vi.stubGlobal('location', {
    href: surface === 'query' ? 'http://localhost/?dsh-surface=desktop' : 'http://localhost/',
  })

  const ctx = new Context()
  class RemoteService extends Service {
    constructor(serviceCtx: Context) { super(serviceCtx, 'remote') }
    $mount(): Promise<() => Promise<void>> { return Promise.resolve(() => Promise.resolve()) }
  }
  void new RemoteService(ctx)
  ctx.provide('remote.agentTeams', { view: () => Promise.resolve({ ok: true, value: {} }) })

  const acted: unknown[] = []
  let current = options.current
  const ids = options.ids ?? []
  ctx.provide('sessions', {
    list: { getSnapshot: () => ({ current, ids }) },
    binding: () => undefined,
    create: () => {
      acted.push(['create'])
      return Promise.resolve(SESSION)
    },
    open: (id: SessionId) => { acted.push(['open', id]); current = id },
  })
  ctx.provide('uiSession', {} as never)
  let scheme: 'light' | 'dark' = 'light'
  ctx.provide('theme', {
    getTheme: () => ({ active: { colorScheme: scheme }, preference: options.preference ?? 'system' }),
    setTheme: (id: 'light' | 'dark') => { scheme = id; acted.push(['theme', id]) },
  } as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'desktop.root': { kind: 'single', scope: 'root' },
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  await mountAgentTeamUi(ctx, REMOTE)
  const root = () => ctx.slots.entries('desktop.root').find(entry => entry.component === DesktopTeamRoot)
  return { ctx, acted, root }
}

describe('desktop surface registration', () => {
  it('claims the desktop root and resolves the default appearance once', async () => {
    const b = await bench()
    expect(b.root()).toBeDefined()
    // The header action is the browser surface's registration; the desktop takes neither both.
    expect(b.ctx.slots.entries('conversation.session.header.actions')).toHaveLength(0)
    expect(b.acted).toEqual([['theme', 'dark']])
  })

  it('leaves an explicit appearance choice alone', async () => {
    const b = await bench({ preference: 'light' })
    expect(b.root()).toBeDefined()
    expect(b.acted).toEqual([])
  })

  it('recognizes the desktop surface from its query parameter', async () => {
    const b = await bench({ surface: 'query' })
    expect(b.root()).toBeDefined()
  })

  it('keeps the header action on an ordinary browser', async () => {
    const b = await bench({ surface: 'browser' })
    expect(b.root()).toBeUndefined()
    expect(b.ctx.slots.entries('conversation.session.header.actions')).toHaveLength(1)
  })

  it('opens the current Session, an existing one, or creates the first', async () => {
    const held = await bench({ current: SESSION, ids: [SESSION] })
    const heldActions = (held.root()!.inject as unknown as () => DesktopTeamRootInjected)()
    await heldActions.ensureSession()
    // Already current: nothing to open.
    expect(held.acted).toEqual([['theme', 'dark']])

    const listed = await bench({ ids: ['stored' as SessionId] })
    const listedActions = (listed.root()!.inject as unknown as () => DesktopTeamRootInjected)()
    await listedActions.ensureSession()
    expect(listed.acted).toEqual([['theme', 'dark'], ['open', 'stored']])

    const empty = await bench()
    const emptyActions = (empty.root()!.inject as unknown as () => DesktopTeamRootInjected)()
    await emptyActions.ensureSession()
    expect(empty.acted).toEqual([['theme', 'dark'], ['create'], ['open', SESSION]])
  })
})
