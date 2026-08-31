# Agent Note: The Team's recorded history reaches the workspace

Status: implemented

English | [中文](2026-08-31-team-activity-timeline.zh.md)

## Problem

Agent Teams writes four durable records into the Lead Session log — `team/member`, `team/task`, `team/message/queued`, and `team/message/delivered` — and no surface showed any of them as history. The browser workspace read `agentTeams/view`, which is a point-in-time projection: it answers where the Team is, never how it got there.

That gap costs exactly the events a projection cannot keep. A completed task shows its final status and not when it was claimed or by whom it passed through. A delivered message leaves the mailbox on delivery, so queue and receipt are both invisible the moment they succeed — the two edges a user most wants to see, because they are the ones that tell them a teammate actually received the work. A failed teammate keeps its `failed` phase, but the provisioning attempt that preceded it is gone from the roster.

The records were already durable and already ordered. Nothing read them.

## Decision

**The history is a read of the Lead Session log, not a second record.** `TeamService.remoteActivity` walks `membership.root.session.events` and projects each Team record through `activityOf`. There is no accumulator to keep in step with the log and nothing that can disagree with what the Team did. The read is bounded by a caller-supplied limit from 1 through 200 — `MAX_ACTIVITY_ENTRIES` — and returns newest first, so a surface asks for what it will render rather than for everything.

**`activityOf` skips inherited records exactly as the fold does.** A fork inherits its ancestor Team's records, and `applyTeamEvent` already ignores any record whose `teamId` is not the fold's own. The projection carries the same guard: without it a forked Lead would list another Team's past as its own history.

**An entry carries structured facts, never a sentence.** `TeamActivityEntry` holds the sequence, the time, the kind, the subject, the state it reached, and the target for the two message kinds. Client UI copy is locale-owned, so the surface that renders an entry is the one that names it; a host-composed string would put product text in the service and force one wording on every consumer.

**The state stays the durable vocabulary.** An entry reports the member phase or task status the record actually holds. The browser maps each to copy and renders an unrecognized value raw rather than dropping the row: a build whose dictionary predates a new phase shows a row it cannot fully name, rather than a Team history with a hole in it.

**The timeline reloads on the board's change signal.** The workspace already holds one bounded `agentTeams/waitForChange` and reloads on every observed change; the history is read inside that same reload. Where the Team is and how it got there therefore never drift apart, and no second polling loop exists to fall behind. Both awaits are guarded against a conversation that has moved on: history that arrives for a session the surface has left is dropped, and a refused history leaves the board it accompanies loaded.

## Alternatives considered

**Render the timeline in the desktop details column.** Rejected once the slot ledger was read. `details` is a single slot owned by `ui-chat`, which declares only `conversation.details.tool` as its child; declaring is claiming, so a second owner is not available. The timeline sits inside the Team workspace, under the board it explains.

**Keep a rolling in-memory history on the service.** Rejected: it duplicates the log, needs its own bound and eviction, and introduces a second thing that can be wrong about the past. The log is already the durable record and already ordered.

**Compose the entry text on the host.** Rejected against locale-owned client copy. It also fixes one phrasing for every future consumer of the Remote.

**Extend `agentTeams/view` with the history.** Rejected: the view is a projection of current state with no limit parameter, and every caller of it would then pay for entries it does not render.

## Consequences

The Remote returns at most 200 entries per call and the workspace asks for 40, so a long-running Team's older history is not reachable from the browser. Paging is the extension point when a consumer needs it; the log holds everything.

An entry names the subject the record carried at the time — a task's subject as of that revision, a member's name — so renaming is not retroactive in the timeline. That is the recorded fact, not a defect.

A delivery whose queued record is no longer in the fold names its target and carries an empty sender, because the sender lives on the enqueue.

`packages/experimental/client-ui-agent-team/src/client/mount.ts` gains one more Remote binding whose arrow body no unit spec executes, matching the eight bindings already beside it. This file and `TeamAction.tsx` carry uncovered lines on a clean tree that no spec in the repository can reach; that debt predates this change and is not addressed here.

## Testing

`fold.spec.ts` covers all four record kinds projected into entries, a non-Team event skipped, a delivery whose enqueue has left the fold, a message addressed to a member the fold no longer holds, and an ancestor Team's record refused. `team.spec.ts` covers the Remote end to end against a real Team: a Lead log carrying non-Team events, newest-first ordering across a task's create and claim, the limit truncating, and every out-of-range limit rejected. The client spec covers every durable phase and status having copy, an unknown state rendered raw, the empty state, a refused history leaving the board loaded, and history from a session the surface has left being dropped.
