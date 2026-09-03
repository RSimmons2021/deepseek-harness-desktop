# Agent Note: taking upstream 0.1.2-rc.1 into the desktop fork

Status: implemented

English | [中文](2026-09-03-upstream-rc1-merge.zh.md)

## Problem

The fork sat on `0.1.2-alpha.1` while upstream reached `0.1.2-rc.1` — 14,966 commits, of which 3,013 are fixes. Staying put meant forgoing all of them and drifting further from `agent-team`, a package upstream changed 66 times in the same window.

Cherry-picking was the obvious first idea and it does not work here. The single most valuable upstream fix, `fix(agent-team): preserve mailbox order on cold resume`, conflicts across six files including `fold.ts` — a file upstream deleted. Every agent-team commit sits downstream of a structural change the fork does not have.

## Decision

**One merge, not a series of picks.** A dry run put the real cost at 97 files auto-merging against 41 conflicts, roughly 17 of them lockfile, manifests, and bilingual doc pairs. That is a bounded job; reconstructing 66 commits by hand is not.

**The Team fold becomes a projection.** Upstream replaced `foldTeam`/`applyTeamEvent`/`TeamFoldState` with a registered `teamProjectionDefinition` over a `TeamState` that holds arrays rather than Maps and drops the name index, because projected state has to serialize. `activityOf` moved onto it; name derivation and undelivered-mail counting scan the arrays. A Team is bounded by its own member and message limits, which is what keeps a scan honest.

**Nothing durable changed, so nothing recorded is at risk.** Both sides carry the same four events — `team/member`, `team/task`, `team/message/queued`, `team/message/delivered` — and the fork's `roleId` and `route` are optional additions to `TeamMemberSnapshot`. A session written by either side reads on the other.

**Peer messages steer, so the delivery choice goes.** Upstream removed quiet-versus-wakeup. The fork followed rather than keeping a divergent mailbox: the composer's selector is gone, and `pendingMessages` now counts only what a target could not take rather than what was deliberately not delivered. Its hint says so.

**The sign-in card rides upstream's operations boundary.** `ui-settings-models` moved to callbacks built in the plugin body. Credentials, llm, and settings reach the page that way; the sign-in card still takes the authorization namespace itself, because it drives a flow rather than reading or writing settings.

## Alternatives considered

**Keeping the fork's `delivery` field.** Rejected. A quiet mode the Host no longer honours would be a control that lies, and maintaining a divergent mailbox is the cost that made this merge expensive in the first place.

**Keeping `ModelsWire`.** Rejected: with credentials, llm, and settings behind operations, the wire had one field left and no consumer. It is deleted rather than kept as a shim.

**Reaching into `session-stats/src/projection.ts` for its map merge.** Kept, with the reason recorded at the import. Token-meter re-exports its projection modules from its root, so the root carries the key merge; session-stats does not, and its `./src/*` export is the only path that reaches the declaration.

## Consequences

Two style gates upstream added rejected the fork's own CSS: solid neutral-token borders are hairlines, and a full-round radius pairs `corner-shape: round` so the global superellipse smoothing does not turn a circle into a squircle. Thirteen rules in the Team surface alone needed the pairing.

Empty invariant companions are now omitted rather than explained in code, so `agent-team-write-lease` publishes none and states the reason in its README; its build config lost the second bundle entry with it.

Client packages declare workspace inputs in `devDependencies` only. The union merge of two manifests put them in both, which the dependency gate rejects.

Three suites fail only under full-suite load — a grammar lazy-load and two `O(depth)` checks — and pass in isolation. They predate this merge.

## Testing

`typecheck`, `oxlint`, `hygiene`, `test:docs`, and `build` all pass on the merged tree, as do the client, experimental, and api suites: 6,236 tests. Four Team tests were rewritten rather than repaired, because the behaviour they described is gone: two asserted a delivery mode that no longer exists, one asserted that a message to an inactive member stays queued when it now wakes it, and one provided a `sessionProjections` service the composition already mounts.
