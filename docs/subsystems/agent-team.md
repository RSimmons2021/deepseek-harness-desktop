# Agent Teams

English | [中文](agent-team.zh.md)

Types shared by the experimental implicit-root Team domain, model tools, and host adapters. The [Agent Teams Agent Note](../../.agents/notes/implemented/feature/2026-08-05-agent-teams.md) owns identity, mailbox, task, and shared-checkout decisions; the [Team Steer messaging Agent Note](../../.agents/notes/implemented/simplification/2026-08-30-team-send-message-steer.md) owns message scheduling; this page records the literal durable forms from [`packages/experimental/agent-team/src/types.ts`](../../packages/experimental/agent-team/src/types.ts).

## Identity and roster

`TeamId` is the root `SessionId` under a distinct [brand](core.md#branded-ids). `TeamTaskId` is Team-local and monotonically allocated as `task-<n>`; `TeamMessageId` is globally random. A teammate's Session id remains its persistent identity, while `name` is an immutable model/UI label.

```ts type-equiv
/** Whole durable value written on every teammate lifecycle change. */
interface TeamMemberSnapshot {
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
```

A member staffed from a role records which one and where it runs, so an idle teammate still reports its own model rather than the Lead's. Every member starts in `provisioning` and reaches exactly one terminal roster phase, `active` or `failed`. Runtime `running`/`idle`/`inactive` status is derived separately and never rewrites this record.

## Durable mailbox

The Lead Session first stores the complete queued message. A target receipt is acknowledged only after its pending inbox item or recorded user message is durable, leaving queued-minus-delivered as the recovery mailbox.

```ts type-equiv
/** One peer message retained until its target Session records it. */
interface TeamMessageSnapshot {
  readonly id: TeamMessageId
  readonly senderId: SessionId
  readonly senderName: string
  readonly targetId: SessionId
  readonly content: ContentBlock[]
}
```

Every message attempts Steer delivery. A running target receives it at the nearest step boundary, an idle target starts a turn, and an inactive teammate cold-resumes. Scheduling is not stored in the durable record because callers cannot select another mode.

The target Session keeps message identity and sender attribution on both the pending inbox item and the eventual user message. Folding that source across inbox and history is the target-side de-duplication key; the model-visible framing repeats the id and sender.

```ts type-equiv
/** Source retained by the target Session for durable mailbox de-duplication. */
interface TeamMessageSource {
  readonly kind: 'team-message'
  readonly teamId: TeamId
  readonly messageId: TeamMessageId
  readonly senderId: SessionId
  readonly senderName: string
}
```

## Shared task DAG

Every task event stores a complete snapshot. `revision` is the compare-and-set value and increments by one per mutation. `blockedBy` edges must name non-deleted tasks and keep the graph acyclic. `writeScopes` are normalized advisory path prefixes rather than locks.

```ts type-equiv
/** Whole durable task snapshot; every mutation increments {@link revision}. */
interface TeamTaskSnapshot {
  readonly id: TeamTaskId
  readonly revision: number
  readonly subject: string
  readonly description: string
  readonly status: TeamTaskStatus
  readonly ownerId?: SessionId
  readonly blockedBy: TeamTaskId[]
  readonly writeScopes: string[]
}
```

`pending` is unstarted or released, `in_progress` carries an owner, `completed` satisfies blockers, and `deleted` is a retained tombstone. Views add owner name, readiness, and write-scope overlap warnings without changing the durable snapshot.

## Replay

`foldTeam()` replays one root Session into the roster, task board, and queued-minus-delivered mailbox that every Team operation reads. It selects records by `TeamId`, so events inherited by an ordinary fork retain the ancestor id and never enter the new root's state. Session event `seq` and `time` remain the ordering and timing record; Team snapshots do not duplicate them. Roster and task reads reach callers as views; pending mail stays internal to delivery and recovery. The package [README](../../packages/experimental/agent-team/README.md) owns operation, authorization, recovery, and limit behavior.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxagentteams--teamservice"></a>

### `ctx.agentTeams` — `TeamService`

Agent Teams service backed by the exact live Lead Session log.

```ts cordis-catalog
/**
 * Resolve one exact live Agent's Team role.
 * @param agent - exact live Agent used as the authority credential.
 * @returns its root, Team identity, role, and model-facing name.
 */
membership(agent: Agent): TeamMembership

/**
 * List the runtime-enriched roster visible to one Team member.
 * @param agent - exact live Team member.
 * @returns Lead and teammate rows in creation order.
 */
listMembers(agent: Agent): TeamMemberView[]

/**
 * Resolve the continuable-subagent provider one context mode spawns through.
 *
 * The provider is a deployment choice, so it has one home here beside the
 * other Team limits: the model-facing tool and the browser Remote both read
 * it rather than each carrying its own copy.
 * @param context - requested teammate context mode.
 * @returns the configured provider name for that mode.
 */
providerFor(context: 'fresh' | 'fork'): string

/**
 * Create one named, continuable direct child of the Team Lead.
 * @param caller - exact live Lead Agent.
 * @param request - immutable name, description, prompt, context mode, provider, and cancellation.
 * @returns the active roster row.
 */
async spawnTeammate(caller: Agent, request: SpawnTeammateRequest): Promise<SpawnTeammateResult>

/**
 * Queue one durable peer message, then attempt immediate delivery.
 * @param caller - exact live sending Team member.
 * @param request - target name, content, and pre-queue cancellation.
 * @returns durable message identity and immediate-delivery observation.
 */
async sendMessage(caller: Agent, request: SendTeamMessageRequest): Promise<SendTeamMessageResult>

/**
 * Create one unowned pending task in the Team Lead log.
 * @param caller - exact live Team member creating the task.
 * @param request - task text, blockers, and advisory write scopes.
 * @returns the revision-one task view.
 */
async createTask(caller: Agent, request: CreateTeamTaskRequest): Promise<TeamTaskView>

/**
 * Return one task, including a deleted tombstone.
 * @param caller - exact live Team member reading the task.
 * @param id - Team-local task identity.
 * @returns the latest task value and derived readiness diagnostics.
 */
getTask(caller: Agent, id: TeamTaskId): TeamTaskView

/**
 * List current non-deleted tasks in numeric creation order.
 * @param caller - exact live Team member reading the board.
 * @returns detached current task views.
 */
listTasks(caller: Agent): TeamTaskView[]

/**
 * Compare-and-set one authorized task transition.
 * @param caller - exact live Team member authorizing the mutation.
 * @param request - task identity, expected revision, action, and action fields.
 * @returns the committed next task revision.
 */
async updateTask(caller: Agent, request: UpdateTeamTaskRequest): Promise<TeamTaskView>

/**
 * Wait for the next Team-domain or member-status change.
 * @param caller - exact live Team member waiting for activity.
 * @param timeoutMs - bounded wait duration from ten seconds through one hour.
 * @param signal - caller cancellation for the wait only.
 * @returns one observed change or a timeout result.
 */
async waitForChange(caller: Agent, timeoutMs: number, signal: AbortSignal): Promise<TeamWaitResult>

/**
 * Interrupt one live teammate turn without clearing its pending inbox.
 * @param caller - exact live Lead Agent.
 * @param targetName - durable teammate name.
 * @returns the target status sampled before cancellation.
 */
interrupt(caller: Agent, targetName: string): { previousStatus: 'running' | 'idle' | 'inactive' }

/**
 * Resolve a caller without throwing, used by scoped-tool installation and observers.
 * @param agent - candidate exact live Agent.
 * @returns Team membership, or undefined for non-Team subagents and stale identities.
 */
tryMembership(agent: Agent): TeamMembership | undefined

/**
 * Read one member's most recent recorded work, newest first.
 *
 * Reads that member's own attached Session log. A member the runtime is not
 * holding has no live log to tail and returns nothing, which is the same
 * state its roster row reports as inactive.
 * @param agent - exact live Team member reading the tail.
 * @param memberName - the member to tail, by its immutable Team name.
 * @param limit - newest lines to return, from one through fifty.
 * @returns the most recent lines, newest first.
 */
@Remote('tail') remoteTail(agent: Agent, memberName: string, limit: number): TeamTailLine[]

/**
 * Decide whether one member may write a workspace-relative path.
 *
 * A scope claimed by an in-progress task is that task owner's to write: this
 * refuses every other member, and refuses nothing else. An unclaimed path,
 * an unowned task's scope, and a scope the caller itself claims all pass, so
 * enforcement adds exclusion between members without requiring a claim
 * before any write.
 *
 * A caller that is not a Team member writes as it always did.
 * @param agent - exact live Agent performing the write.
 * @param path - normalized workspace-relative path being written.
 * @returns the model-facing refusal, or undefined when the write may proceed.
 */
writeRefusal(agent: Agent, path: string): string | undefined

/**
 * Read the current roster and non-deleted task board through the generated Remote API.
 * @param agent - exact live Team member used as the authority credential.
 * @returns detached current roster and task views.
 */
@Remote('view') remoteView(agent: Agent): TeamView

/**
 * Create one shared task through the generated Remote API.
 * @param agent - exact live Team member creating the task.
 * @param request - task text, blockers, and advisory write scopes.
 * @returns the revision-one task or a typed Team rejection.
 */
@Remote('createTask') remoteCreateTask(agent: Agent, request: CreateTeamTaskRequest): Promise<TeamTaskMutationResult>

/**
 * Apply one task mutation and preserve Team rejections as business results.
 * @param agent - exact live Team member authorizing the mutation.
 * @param request - task identity, expected revision, action, and action fields.
 * @returns the committed task or a typed Team rejection.
 */
@Remote('updateTask') remoteUpdateTask(agent: Agent, request: UpdateTeamTaskRequest): Promise<TeamTaskMutationResult>

/**
 * Create one durable teammate through the generated Remote API.
 *
 * The request carries no provider or cancellation: the service resolves the
 * provider from the requested context mode, and the spawn runs to its durable
 * active or failed edge rather than following a caller's signal.
 * @param agent - exact live Lead Agent creating the teammate.
 * @param request - immutable name, description, opening prompt, and context mode.
 * @returns the active roster row, or a typed Team rejection.
 */
@Remote('spawnTeammate') async remoteSpawnTeammate( agent: Agent, request: RemoteSpawnTeammateRequest, ): Promise<TeamSpawnMutationResult>

/**
 * Queue one durable peer message through the generated Remote API.
 *
 * The request carries no cancellation: the wire cannot hold an `AbortSignal`,
 * and the enqueue is durable before delivery is attempted, so there is no
 * pre-queue window for a browser to cancel.
 * @param agent - exact live Team member sending the message.
 * @param request - target name, message text, and scheduling mode.
 * @returns durable message identity and delivery observation, or a typed Team rejection.
 */
@Remote('sendMessage') async remoteSendMessage( agent: Agent, request: RemoteSendTeamMessageRequest, ): Promise<TeamMessageMutationResult>

/**
 * Interrupt one live teammate turn through the generated Remote API.
 * @param agent - exact live Lead Agent authorizing the interrupt.
 * @param targetName - durable teammate name.
 * @returns the status sampled before cancellation, or a typed Team rejection.
 */
@Remote('interrupt') remoteInterrupt(agent: Agent, targetName: string): TeamInterruptMutationResult

/**
 * The Team's recorded history, newest first, through the generated Remote API.
 *
 * Every Team change is already a durable event in the Lead Session log, so
 * this reads that log rather than keeping a second record: nothing here can
 * disagree with what the Team actually did. Entries carry structured facts,
 * not sentences, because the copy naming them is locale-owned by the surface.
 * @param agent - exact live Team member reading the history.
 * @param limit - newest entries to return, from one through two hundred.
 * @returns the most recent entries, newest first.
 */
@Remote('activity') remoteActivity(agent: Agent, limit: number): TeamActivityEntry[]

/**
 * Follow this Team until the caller stops listening.
 *
 * Yields the current view, then the view again after every observed change.
 * The stream carrier owns the cancellation, so a browser that disconnects
 * ends its wait immediately instead of leaving one outstanding until a
 * timeout expires — which is what a poll over a wire carrying no
 * cancellation could not do.
 *
 * Every frame carries the whole view rather than an increment: this Team's
 * view is small, and a client that replaces it on each frame cannot drift.
 * @param agent - exact live Team member following the Team.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns the opening view followed by one frame per observed change.
 */
@Remote({ mode: 'stream' }) async *follow(agent: Agent, signal: AbortSignal): AsyncIterable<TeamFollowFrame>
```

Types: [Agent](core.md)

Source: [`packages/experimental/agent-team/src/index.ts`](../../packages/experimental/agent-team/src/index.ts)
<!-- END GENERATED cordis-surface -->
