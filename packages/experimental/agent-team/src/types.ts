/** Public Agent Teams identities, durable records, and service request values. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Identifies the implicit team rooted at one top-level Session. */
export type TeamId = Branded<'TeamId'>

/**
 * Brand one root Session identity as its implicit Team identity.
 * @param id - Root Session identity.
 * @returns the same string branded as a Team identity.
 */
export function TeamId(id: SessionId | string): TeamId {
  return id as TeamId
}

/** Stable identifier for one task in a Team. */
export type TeamTaskId = Branded<'TeamTaskId'>

/**
 * Brand a validated task id.
 * @param id - Team-local task identity.
 * @returns the same string branded as a Team task identity.
 */
export function TeamTaskId(id: string): TeamTaskId {
  return id as TeamTaskId
}

/** Stable identifier for one durable peer message. */
export type TeamMessageId = Branded<'TeamMessageId'>

/**
 * Brand a generated peer-message id.
 * @param id - Durable mailbox message identity.
 * @returns the same string branded as a Team message identity.
 */
export function TeamMessageId(id: string): TeamMessageId {
  return id as TeamMessageId
}

/** Durable teammate lifecycle. */
export type TeamMemberPhase = 'provisioning' | 'active' | 'failed'

/** Whole durable value written on every teammate lifecycle change. */
export interface TeamMemberSnapshot {
  readonly id: SessionId
  readonly name: string
  readonly description: string
  readonly provider: string
  readonly context: 'fresh' | 'fork'
  readonly phase: TeamMemberPhase
  readonly error?: string
  /** The role this member was staffed from, when it was staffed from one. */
  readonly roleId?: string
  /**
   * Where this member runs, recorded at creation.
   *
   * Durable rather than read from the live Agent, because a member that is not
   * attached still runs on the route it was created with: reading only the live
   * Agent made an idle routed teammate report the Lead's model instead.
   */
  readonly route?: TeamRoleRoute
}

/**
 * What one member has spent so far.
 *
 * Read from that member's Session projections, which their owning plugins
 * already maintain, rather than folded here: no log read, and nothing that can
 * disagree with what the Session recorded. Reported only for a member whose
 * Session is attached — a composition without the projection plugins, or a
 * member that is not attached, reports no effort at all rather than a zero
 * that would read as "did nothing".
 */
export interface TeamMemberEffort {
  /** Turns carrying at least one closed step. */
  readonly turns: number
  /** Model wall time in milliseconds, over steps that assembled a message. */
  readonly modelMs: number
  /** Tool wall time in milliseconds, over matched call and result pairs. */
  readonly toolMs: number
  /** Provider input tokens that its cache did not serve. */
  readonly inputTokens: number
  /** Provider output tokens. */
  readonly outputTokens: number
  /** Provider input tokens served from its cache. */
  readonly cacheReadTokens: number
}

/** Current runtime-enriched roster row. */
export interface TeamMemberView {
  readonly id: SessionId
  readonly name: string
  readonly role: 'lead' | 'teammate'
  readonly status: 'running' | 'idle' | 'inactive' | 'provisioning' | 'failed'
  readonly description?: string
  readonly provider?: string
  readonly context?: 'fresh' | 'fork'
  /** The role this member was staffed from, when it was staffed from one. */
  readonly roleId?: string
  readonly model?: string
  readonly effort?: TeamMemberEffort
  /**
   * Durable messages addressed to this member that it has not recorded yet.
   *
   * A message whose target could not take it stays in the mailbox until the
   * member is next available. Counting it here is what makes that visible:
   * `sendMessage` already answers `queued` rather than `accepted`, but nothing
   * showed the backlog afterwards.
   */
  readonly pendingMessages: number
  readonly diagnostics: string[]
}

/** Durable task lifecycle. */
export type TeamTaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted'

/** Whole durable task snapshot; every mutation increments {@link revision}. */
export interface TeamTaskSnapshot {
  readonly id: TeamTaskId
  readonly revision: number
  readonly subject: string
  readonly description: string
  readonly status: TeamTaskStatus
  readonly ownerId?: SessionId
  readonly blockedBy: TeamTaskId[]
  readonly writeScopes: string[]
}

/** Runtime-enriched task view returned to tools and hosts. */
export interface TeamTaskView {
  readonly id: TeamTaskId
  readonly revision: number
  readonly subject: string
  readonly description: string
  readonly status: TeamTaskStatus
  readonly blockedBy: TeamTaskId[]
  readonly writeScopes: string[]
  readonly ownerName?: string
  readonly ready: boolean
  readonly writeScopeWarnings: string[]
}

/** Point-in-time roster and task-board projection returned to browser clients. */
export interface TeamView {
  readonly members: TeamMemberView[]
  readonly tasks: TeamTaskView[]
  /**
   * Immutable teammate names this Team may hold, from `maxMembers`. A surface
   * offering to add one needs the same limit the service enforces, or it stops
   * offering while the Team still has room.
   */
  readonly capacity: number
}

/** One peer message retained until its target Session records it. */
export interface TeamMessageSnapshot {
  readonly id: TeamMessageId
  readonly senderId: SessionId
  readonly senderName: string
  readonly targetId: SessionId
  readonly content: ContentBlock[]
}

/** Source retained by the target Session for durable mailbox de-duplication. */
export interface TeamMessageSource {
  readonly kind: 'team-message'
  readonly teamId: TeamId
  readonly messageId: TeamMessageId
  readonly senderId: SessionId
  readonly senderName: string
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'team-message': TeamMessageSource
  }
}

/**
 * Where one role's teammates run.
 *
 * Every field is optional and an absent field inherits the Lead's own route,
 * which is what keeps a role from quietly costing quality: a deployment opts a
 * role onto a different model, and nothing is moved off the Lead's model
 * without someone saying so.
 */
export interface TeamRoleRoute {
  /** Provider route; absent inherits the Lead's. */
  readonly provider?: string
  /** Model id for that provider; absent inherits the Lead's. */
  readonly model?: string
  /** Adapter-owned reasoning effort; absent inherits the provider's default for the model. */
  readonly reasoningEffort?: string
}

/**
 * One named way to staff a Team.
 *
 * A role carries everything a teammate needs except the work itself, so
 * creating one is choosing a role and describing a task rather than composing
 * a name, a label, an opening prompt, and a context mode by hand.
 */
export interface TeamRole {
  /** Stable identifier the tool and the browser name this role by. */
  readonly id: string
  /** Name stem for teammates created from this role; the Team suffixes it to keep names unique. */
  readonly name: string
  /** One line naming what this member is for; becomes the durable creation label. */
  readonly description: string
  /** Standing instruction placed above the task the caller supplies. */
  readonly brief: string
  /** Whether the teammate starts fresh or from the Lead's completed prefix. */
  readonly context: 'fresh' | 'fork'
  /** Where this role's teammates run; absent inherits the Lead's route entirely. */
  readonly route?: TeamRoleRoute
}

/** Team-service deployment limits. */
export interface Config {
  /**
   * Named ways to staff a Team, replacing the built-in set when supplied.
   *
   * Which models a deployment has, and which of them a given kind of work
   * deserves, are deployment facts rather than product ones.
   */
  readonly roles?: readonly TeamRole[]
  /** Maximum immutable teammate names retained by one Team. */
  readonly maxMembers?: number
  /** Maximum non-deleted tasks retained by one Team. */
  readonly maxTasks?: number
  /** Maximum queued-minus-delivered messages for one target member. */
  readonly maxPendingMessagesPerMember?: number
  /** Maximum UTF-8 bytes in one complete sender-framed delivery. */
  readonly maxMessageBytes?: number
  /** Maximum milliseconds allowed for Team-owned runtime disposal. */
  readonly disposalTimeoutMs?: number
  /** Continuable-subagent provider that starts fresh teammates. */
  readonly freshProvider?: string
  /** Continuable-subagent provider that starts completed-prefix fork teammates. */
  readonly forkProvider?: string
}

/** Input for creating one durable teammate. */
export interface SpawnTeammateRequest {
  readonly name: string
  readonly description: string
  readonly prompt: ContentBlock[]
  readonly context: 'fresh' | 'fork'
  readonly provider: string
  /** The role this teammate was staffed from, recorded on its durable member row. */
  readonly roleId?: string
  /** Provider/model/effort for this teammate; absent inherits the Lead's route. */
  readonly route?: TeamRoleRoute
  readonly signal: AbortSignal
}

/**
 * Input for staffing one teammate from a role, or from composed fields.
 *
 * The optional fields are what a role supplies; a caller with no role must
 * supply all of them.
 */
export interface StaffTeammateRequest {
  /** The role to staff. */
  readonly role?: string
  /** Override for the name the role would derive. */
  readonly name?: string
  /** Override for the role's durable creation label. */
  readonly description?: string
  /** The work itself; a role's brief is placed above it. */
  readonly prompt: string
  /** Override for the role's context mode. */
  readonly context?: 'fresh' | 'fork'
  /** Caller cancellation for the whole creation. */
  readonly signal: AbortSignal
}

/** Result after one teammate reaches a durable active or failed edge. */
export interface SpawnTeammateResult {
  readonly member: TeamMemberView
}

/** Input for one durable peer message. */
export interface SendTeamMessageRequest {
  readonly target: string
  readonly content: ContentBlock[]
  readonly signal: AbortSignal
}

/** Result after a peer message enters the durable mailbox. */
export interface SendTeamMessageResult {
  readonly messageId: TeamMessageId
  readonly status: 'accepted' | 'queued'
}

/** Input for creating one shared task. */
export interface CreateTeamTaskRequest {
  readonly subject: string
  readonly description: string
  readonly blockedBy?: readonly TeamTaskId[]
  readonly writeScopes?: readonly string[]
}

/** Supported task mutation actions. */
export type TeamTaskAction =
  | 'claim'
  | 'release'
  | 'edit'
  | 'set_dependencies'
  | 'complete'
  | 'reopen'
  | 'reassign'
  | 'delete'

/** Compare-and-set mutation of one shared task. */
export interface UpdateTeamTaskRequest {
  readonly taskId: TeamTaskId
  readonly expectedRevision: number
  readonly action: TeamTaskAction
  readonly subject?: string
  readonly description?: string
  readonly blockedBy?: readonly TeamTaskId[]
  readonly writeScopes?: readonly string[]
  readonly owner?: string
}

/** Browser task mutation result with stale revisions kept distinct from other Team rejections. */
export type TeamTaskMutationResult =
  | { readonly ok: true; readonly value: TeamTaskView }
  | {
    readonly ok: false
    readonly error: {
      readonly code: 'team-task-conflict' | 'team-rejected'
      readonly message: string
    }
  }

/**
 * Browser-supplied spawn input. A Remote request carries no `AbortSignal`, and
 * the provider is a deployment choice the service resolves from the requested
 * context mode rather than a value a caller may pick.
 */
export interface RemoteSpawnTeammateRequest {
  /**
   * The role to staff, which supplies the name, the label, the standing brief,
   * the context mode, and the route. Absent means the caller is composing a
   * teammate by hand and must supply `name`, `description`, and `context`.
   */
  readonly role?: string
  /**
   * The teammate's name. Absent with a role means the Team derives one from the
   * role's stem, suffixing it until it is unique in this Team.
   */
  readonly name?: string
  /** The durable creation label. Absent with a role means the role's own. */
  readonly description?: string
  /** The work itself; a role's brief is placed above it. */
  readonly prompt: string
  /** Absent with a role means the role's own context mode. */
  readonly context?: 'fresh' | 'fork'
}

/** Outcome of one Remote spawn, preserving Team rejections as business values. */
export type TeamSpawnMutationResult =
  | { readonly ok: true; readonly value: SpawnTeammateResult }
  | {
    readonly ok: false
    readonly error: {
      readonly code: 'team-rejected'
      readonly message: string
    }
  }

/**
 * Browser-supplied peer message. A Remote request carries no `AbortSignal`, and
 * the text arrives as one string that the service frames as a content block.
 */
export interface RemoteSendTeamMessageRequest {
  readonly target: string
  readonly message: string
}

/** Outcome of one Remote peer message, preserving Team rejections as business values. */
export type TeamMessageMutationResult =
  | { readonly ok: true; readonly value: SendTeamMessageResult }
  | {
    readonly ok: false
    readonly error: {
      readonly code: 'team-rejected'
      readonly message: string
    }
  }

/** Status one teammate held immediately before an interrupt was applied. */
export interface TeamInterruptView {
  readonly previousStatus: 'running' | 'idle' | 'inactive'
}

/** Outcome of one Remote interrupt, preserving Team rejections as business values. */
export type TeamInterruptMutationResult =
  | { readonly ok: true; readonly value: TeamInterruptView }
  | {
    readonly ok: false
    readonly error: {
      readonly code: 'team-rejected'
      readonly message: string
    }
  }

/** What one recorded Team change was, for a surface rendering a timeline. */
export type TeamActivityKind = 'member' | 'task' | 'message-queued' | 'message-delivered'

/**
 * One entry of the Team's recorded history.
 *
 * Structured facts rather than a sentence: the copy naming what happened is
 * locale-owned by whichever surface renders it, so this carries the subject and
 * the state it reached and nothing pre-composed.
 */
export interface TeamActivityEntry {
  /** Monotonic sequence in the Lead Session log; stable across reads. */
  readonly seq: number
  /** Unix epoch milliseconds the change was recorded. */
  readonly time: number
  /** Which kind of change this was. */
  readonly kind: TeamActivityKind
  /** Member name, task subject, or sending member, by kind. */
  readonly subject: string
  /** Member phase or task status; absent for the message kinds. */
  readonly state?: string
  /** Receiving member; present only for the message kinds. */
  readonly target?: string
}

/** What one recorded line of a member's own work was. */
export type TeamTailKind = 'assistant' | 'tool' | 'tool-result'

/**
 * One line of a member's most recent work, read from its own Session log.
 *
 * Text only, already truncated: a tail is for watching a teammate work, not
 * for reconstructing its transcript, and the teammate's own conversation is
 * one navigation away.
 */
export interface TeamTailLine {
  /** Monotonic sequence in that member's Session log; stable across reads. */
  readonly seq: number
  /** Unix epoch milliseconds the line was recorded. */
  readonly time: number
  /** Which kind of line this was. */
  readonly kind: TeamTailKind
  /** Tool name for the tool kinds; absent for assistant text. */
  readonly name?: string
  /** The line's text, truncated to the service's per-line cap. */
  readonly text: string
  /** Whether {@link text} was cut at the cap. */
  readonly truncated?: true
}

/**
 * One frame of the Team follow stream.
 *
 * Both frames carry the whole view: the Team is small enough that recomputing
 * it costs less than an increment vocabulary the surface would have to fold,
 * and a reconnecting client that replaces its view on every frame cannot drift
 * from the Host. The discriminant separates the opening frame, which a client
 * must receive before it has anything to show, from the ones a change produced.
 */
export type TeamFollowFrame =
  | { readonly type: 'baseline'; readonly view: TeamView }
  | { readonly type: 'update'; readonly view: TeamView }

/** Result of waiting for Team activity. */
export interface TeamWaitResult {
  readonly timedOut: boolean
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Whole teammate lifecycle value, stored only in the Team Lead Session. */
    'team/member': { version: 2; teamId: TeamId; member: TeamMemberSnapshot }
    /** Whole shared-task value, stored only in the Team Lead Session. */
    'team/task': { version: 2; teamId: TeamId; task: TeamTaskSnapshot }
    /** Durable mailbox enqueue, stored before delivery is attempted. */
    'team/message/queued': { version: 2; teamId: TeamId; message: TeamMessageSnapshot }
    /** Durable acknowledgement that the target Session recorded the message. */
    'team/message/delivered': {
      version: 2
      teamId: TeamId
      messageId: TeamMessageId
      targetId: SessionId
    }
  }
}
