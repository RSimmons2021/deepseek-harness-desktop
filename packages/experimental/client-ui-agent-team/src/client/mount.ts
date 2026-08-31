/** Source-safe Agent Teams browser registration and Remote mount lifecycle. */

import type {
  TeamFollowFrame,
  TeamMemberView as TeamRosterMember,
  TeamView,
} from '@deepseek-ai/dsh-experimental-agent-team/client'
import type {} from '@deepseek-ai/dsh-experimental-agent-team/remote'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { RemoteSnapshotStream } from '@deepseek-ai/dsh-api-gateway/client'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import {
  TeamAction, type TeamActionInjected, type TeamActionResult, type TeamTaskActionResult,
} from './TeamAction.tsx'
import { DesktopTeamRoot, type DesktopTeamRootInjected } from './DesktopTeamRoot.tsx'
import { en, NS, zh, type TeamKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Agent Teams roster and task-board copy. */
    'agent-team': TeamKey
  }
}

/** Required browser services for RPC, navigation, slots, and localized copy. */
export const inject = ['sessions', 'remote', 'slots', 'locale', 'uiSession', 'theme']

/** Diagnostic owner name shared by the stream and the snapshot consumer above it. */
const STREAM_NAME = 'Agent Team view stream'

type TeamStreamRemote = Pick<ClientRemote, '$stream'>
type TeamBaselineFrame = Extract<TeamFollowFrame, { type: 'baseline' }>
type TeamUpdateFrame = Extract<TeamFollowFrame, { type: 'update' }>

function isDesktopSurface(): boolean {
  if (typeof window === 'undefined') return false
  return navigator.userAgent.includes('DeepSeekHarnessDesktop')
    || new URL(window.location.href).searchParams.get('dsh-surface') === 'desktop'
}

function registerUi(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'client-ui-agent-team: dictionaries')
  const sessions = ctx.sessions
  const leadSessionId = (sessionId: SessionId): SessionId => {
    const address = sessions.binding(sessionId)?.session.getSnapshot().subagent?.address
    return address?.parentSessionId ?? sessionId
  }

  // Appearance face for the workspace toolbar. The runtime owns the preference
  // and its persistence; this only reads the resolved scheme and writes the
  // opposite one, so the control never invents a third source of theme state.
  const colorScheme: HostObservable<'light' | 'dark'> = {
    getSnapshot: () => ctx.theme.getTheme().active.colorScheme,
    subscribe: onChange => ctx.on('theme/change', () => { onChange() }),
  }

  const actions: TeamActionInjected = {
    hooks: { colorScheme },
    toggleTheme: () => {
      ctx.theme.setTheme(ctx.theme.getTheme().active.colorScheme === 'dark' ? 'light' : 'dark')
    },
    async load(sessionId): Promise<TeamActionResult<TeamView>> {
      return await ctx.remote.agentTeams.view(leadSessionId(sessionId))
    },
    async createTask(sessionId, input): Promise<TeamTaskActionResult> {
      return await ctx.remote.agentTeams.createTask(leadSessionId(sessionId), input)
    },
    async updateTask(sessionId, input) {
      const { owner, ...rest } = input
      return await ctx.remote.agentTeams.updateTask(leadSessionId(sessionId), {
        ...rest,
        ...owner === undefined ? {} : { owner },
      })
    },
    async spawnTeammate(sessionId, request) {
      return await ctx.remote.agentTeams.spawnTeammate(leadSessionId(sessionId), request)
    },
    async sendMessage(sessionId, request) {
      return await ctx.remote.agentTeams.sendMessage(leadSessionId(sessionId), request)
    },
    async activity(sessionId, limit) {
      return await ctx.remote.agentTeams.activity(leadSessionId(sessionId), limit)
    },
    async tail(sessionId, memberName, limit) {
      return await ctx.remote.agentTeams.tail(leadSessionId(sessionId), memberName, limit)
    },
    async interrupt(sessionId, targetName) {
      return await ctx.remote.agentTeams.interrupt(leadSessionId(sessionId), targetName)
    },
    follow(sessionId, accept, failed) {
      // The Gateway owns reconnection and cancellation: the surface starts one
      // logical stream and disposes it, and a browser that goes away ends its
      // Host-side wait immediately rather than leaving one outstanding.
      const stream = new RemoteSnapshotStream<TeamBaselineFrame, TeamUpdateFrame>(
        (ctx.remote as TeamStreamRemote).$stream<TeamFollowFrame>({
          name: STREAM_NAME,
          open: signal => ctx.remote.agentTeams.follow(leadSessionId(sessionId), signal),
          ended: accepted => new Error(accepted
            ? `${STREAM_NAME} ended without a terminal result`
            : `${STREAM_NAME} ended before its opening view`),
        }),
        {
          name: STREAM_NAME,
          isSnapshot: (frame): frame is TeamBaselineFrame => frame.type === 'baseline',
          // Every frame carries the whole view, so the opening frame and each
          // later one are accepted the same way.
          replace: (frame) => { accept(frame.view) },
          update: (frame) => { accept(frame.view) },
          failed,
        },
      )
      stream.start()
      return () => { void stream.dispose() }
    },
    async openTeammate(sessionId: SessionId, member: TeamRosterMember): Promise<void> {
      if (member.role !== 'teammate') return
      const parentSessionId = leadSessionId(sessionId)
      await sessions.refreshSubagents(parentSessionId)
      if (sessions.list.getSnapshot().current !== sessionId) return
      sessions.openSubagent({
        parentSessionId,
        childSessionId: member.id,
        mode: 'continuable',
      })
    },
  }

  if (isDesktopSurface()) {
    // The desktop artwork is designed as a dark workspace. Resolve the default
    // `system` preference once, then leave every explicit user choice alone.
    if (ctx.theme.getTheme().preference === 'system') ctx.theme.setTheme('dark')
    const desktopActions: DesktopTeamRootInjected = {
      ...actions,
      ensureSession: async () => {
        const snapshot = sessions.list.getSnapshot()
        const sessionId = snapshot.current ?? snapshot.ids[0] ?? await sessions.create()
        if (sessions.list.getSnapshot().current !== sessionId) sessions.open(sessionId)
      },
    }
    ctx.slots.inject('desktop.root', () => ctx.slots.register({
      name: 'desktop.root', locale: NS, inject: () => desktopActions,
    }, DesktopTeamRoot))
    return
  }

  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'agent-team',
      order: 20,
      locale: NS,
      inject: () => actions,
    }, TeamAction),
  )
}

/**
 * Mount one generated Team Remote contribution, then register its browser UI.
 * @param ctx - Client Context carrying navigation, locale, slot, and Remote services.
 * @param contribution - generated Team descriptors selected by the browser entry.
 * @returns disposer for both the UI registrations and Remote namespace.
 */
export async function mountAgentTeamUi(
  ctx: ClientContext,
  contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['sessions', 'remote.agentTeams', 'slots', 'locale', 'theme'], registerUi)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}
