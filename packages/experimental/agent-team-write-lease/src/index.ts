/**
 * Turn a Team's advisory write scopes into refusals on the filesystem tool path.
 *
 * A scope claimed by an in-progress task belongs to that task's owner while it
 * is in progress. This plugin asks the Team service about each write the fs
 * tools are about to make and fails the ones another member has claimed, so an
 * overlap stops being something a Lead reads about after both members edited
 * the same paths.
 *
 * @module @deepseek-ai/dsh-experimental-agent-team-write-lease
 */

import type { Context } from '@deepseek-ai/cordis'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-experimental-agent-team'

/** Cordis plugin name. */
export const name = 'agent-team-write-lease'

/**
 * Required services. `fs` is injected although this plugin never calls it: the
 * decision it registers is only meaningful where a filesystem the tools write
 * through is actually mounted.
 */
export const inject = ['agents', 'agentTeams', 'fs']

/**
 * Refuse a write the Team says belongs to another member.
 * @param ctx - plugin context carrying the Agent and Team services.
 * @param target - the resolved target about to be written or edited.
 * @throws when an in-progress task owned by another member claims the path.
 */
function refuseClaimed(ctx: Context, target: FsTarget): void {
  // The write runs under the initiating Agent's chain, so the caller is read
  // from that scope rather than from the seam's deliberately opaque actor.
  const agent = ctx.agents.currentInitiator()
  if (agent === undefined) return
  const refusal = ctx.agentTeams.writeRefusal(agent, target.displayPath)
  if (refusal !== undefined) throw new Error(`write refused: ${refusal}`)
}

/**
 * Register the lease decision ahead of every other write decider.
 *
 * Both listeners prepend and delegate through `next()`: the observation policy
 * occupies the decision slot without delegating, so a lease registered behind
 * it would never run, and one that answered instead of delegating would drop
 * the staleness guard that slot exists to produce.
 * @param ctx - plugin context.
 */
export function apply(ctx: Context): void {
  // Deferred through Promise.resolve().then so the declared Promise return
  // type holds: a refusal must reject the waterfall, never escape it
  // synchronously.
  ctx.effect(() => ctx.on('fs/write-intent', (target, _actor, next) => Promise.resolve().then(() => {
    refuseClaimed(ctx, target)
    return next()
  }), { prepend: true }), 'agent-team-write-lease: write decision')

  ctx.effect(() => ctx.on('fs/edit-intent', (target, _actor, next) => Promise.resolve().then(() => {
    refuseClaimed(ctx, target)
    return next()
  }), { prepend: true }), 'agent-team-write-lease: edit decision')
}
