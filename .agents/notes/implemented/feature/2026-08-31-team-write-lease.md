# Agent Note: A claimed write scope becomes a refusal

Status: implemented

English | [中文](2026-08-31-team-write-lease.zh.md)

## Problem

An Agent Teams task can claim write scopes, and until now claiming one bought nothing. The board computed `writeScopeWarnings` when two in-progress tasks overlapped, the roster showed the overlap on the owning member's card, and the Web workspace listed a scope map — three surfaces reporting a collision that had already been allowed to happen. Two teammates could edit the same paths all the way to the final diff, and the Lead found out by reading it.

The package's own limitations called the scopes advisory and named the reason: nothing enforced them.

## Decision

**A scope claimed by an in-progress task is its owner's while the task is in progress.** `TeamService.writeRefusal(agent, path)` answers whether one member may write one workspace-relative path, and the Team service owns that decision because it owns the board the claims live on. It refuses only the specific collision: an in-progress task, an owner other than the writer, and a claimed scope covering the path. An unclaimed path, an unstarted or completed task's claim, an unowned task's claim, and the writer's own claim all pass, so enforcement adds exclusion between members without requiring a claim before any write. A Team that never uses write scopes behaves exactly as it did.

**Enforcement is a separate Consumer plugin.** `dsh-experimental-agent-team-write-lease` registers on the filesystem capability's `fs/write-intent` and `fs/edit-intent` decision slots. Keeping it out of the service leaves the Team domain free of filesystem vocabulary, and leaves a composition free to run the Team layer without it.

**Both listeners prepend and both delegate.** `dsh-fs-observation-policy` occupies the same single decision slot without calling `next()`, so a lease registered behind it would never run — prepending is what makes the lease reachable rather than a matter of which plugin loaded first. Delegating is equally load-bearing: a lease that answered the waterfall itself would drop the staleness guard that slot exists to produce. Each listener defers through `Promise.resolve().then` so a refusal rejects the waterfall instead of escaping it synchronously.

**The acting Agent comes from the initiator scope, not the seam's actor.** The filesystem capability types `actor` as an opaque object on purpose, and reaching into it would make this package depend on the tool-execution shape. `ctx.agents.currentInitiator()` answers the same question from the driver chain the write already runs under. A write with no initiating Agent is left to the rest of the chain.

**The refusal names what the model needs to act.** `write refused: <path> is inside "<scope>", claimed by task <id> in progress by <owner>` gives the path, the scope, the task, and the member holding it, so the model can message that member, take the task over, or work elsewhere. The wording belongs to this package; `writeRefusal` returns the reason rather than throwing.

## Alternatives considered

**Enforce inside `FileSystem.writeText`.** Rejected: `FileSystem` is the capability's Service Definition, and its providers are backends. Teaching a backend about Team membership inverts the seam.

**Refuse any write outside a scope the writer claims.** Rejected: it would force every Team to adopt scopes before anyone could edit anything, and it would break the Lead, which usually holds no task at all.

**Register without prepending and rely on load order.** Rejected. Listener order is not enforcement when another listener can occupy the slot first, and the observation policy does exactly that.

**Read the acting Agent from `actor`.** Rejected: the seam types it opaque, and a cast would couple this package to the tool-execution context the filesystem capability declined to expose.

## Consequences

Coverage is the filesystem tools only. Bash, formatters, code generators, and any direct `ctx.fs.writeText` caller still write inside another member's scope — the same reach the existing version guards have, now recorded in both packages' limitations rather than only in the Team's.

Scopes stay string prefixes: exact match or `/`-delimited containment, with no glob, no symlink resolution, and no normalization beyond what the board validates on claim. Two spellings of one directory remain two scopes.

A reassignment moves the lease with its task and a completion releases it, because both are derived from the board rather than held anywhere separately. There is nothing to leak and nothing to release on failure.

`TeamService.writeRefusal` reads task views rather than raw snapshots, so the owner it names is already resolved to the same name the caller's own membership carries and the two compare directly.

## Testing

The Team package covers the decision against a real Team through the real board: an unstarted claim leasing nothing, a claimed scope refusing another member, the owner writing its own claim, a sibling directory whose name merely starts with the scope, the scope's own path, a reassignment moving the lease, a completion releasing it, and a caller that is not a Team member. The lease package drives both waterfalls against a decider that occupies the slot without delegating — the ordering the observation policy actually produces — covering a passed write reaching that decider, a refused write never reaching it, a write with no initiating Agent, and disposal removing both decisions. The profile suite asserts the layer mounts it.
