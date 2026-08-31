# Agent Note: What each Team member has spent

Status: implemented

English | [中文](2026-08-31-team-member-effort.zh.md)

## Problem

A Team roster named who its members were and what they were doing, and nothing about what any of them cost. With eight seats available and every teammate free to run its own turns, the one question a Lead cannot answer from the surface is which teammate is consuming the budget.

The data already existed and nothing read it. `session-stats` maintains turn and step counts with model and tool wall time; `token-meter` maintains provider input, output, and cache token totals. Both are Session projections, maintained by their owning plugins on every committed event.

## Decision

**Effort is a projection read, never a fold and never a log read.** `TeamRoster.effortOf` asks `ctx.sessionProjections.stateOf` for that member's `sessionStats` and `tokenUsage`. Both are synchronous and touch only state the projection runtime has already materialized, so a roster read costs the same as it did before.

**The two units are independent.** A composition mounting only one reports that half against zeros for the other, because a member that has run has genuinely spent zero of what nobody is counting. A composition mounting neither reports no `effort` at all — an absent field, not a zeroed one, because "nothing is measuring this" and "this member did nothing" are different facts and a roster that conflates them is lying about an idle teammate.

**No money.** This repository prices tokens, never currency: `route-pricing` is about how many tokens content costs. A rate table mapping models to dollars would be an unsupported public choice with no current owner, and it would be wrong for every deployment that negotiated its own rates. `effort` reports the resource the harness actually meters.

**Time is wall time over the work, not lifetime.** `modelMs` is summed model time over steps that assembled a message and `toolMs` is summed tool time over matched call/result pairs, both from `sessionStats`. A teammate that was created an hour ago and ran for four seconds reads as four seconds.

**The card names cache only when there was cache.** A zero `cacheReadTokens` is not the same fact as a provider that serves no cache, and a tile that always shows it teaches nothing.

## Alternatives considered

**Fold usage into the Team's own journal.** Rejected: it duplicates two projections that are already correct, and it would need a Team event per teammate turn to stay current.

**Read a cold member's checkpoint through `sessionProjectionCache.cachedSnapshot`.** Wanted, not reachable here. It needs the member's `SessionHeader` as its identity witness, and every path from a Session id to a header is asynchronous (`sessionPersistence.inspect`) or reads the whole log — which is exactly what the discovery-cost work ruled out, and which a synchronous roster read cannot do at all. The consequence is recorded below and in the package's limitations.

**Make `roster.list()` asynchronous so the cold path becomes reachable.** Rejected for now: `list()` backs `remoteView` and the model-facing roster tool, and `inspect` returns the entire event log per member per refresh. Buying cold effort at one full log read per teammate per change signal is the trade the @-mention discovery work already refused.

**Report `subagentTiming` instead of `sessionStats`.** Rejected: `subagentTiming` is declared by the subagent package and exists only for subagent Sessions, so the Lead would have no timing and the roster would carry two different meanings of "time" in one column.

## Consequences

A teammate between turns is not attached and reports no effort, so the roster shows spend for members that are running and nothing for members that have stopped — the opposite of what a review after the fact wants. This is the feature's main limit and it is recorded in the package's Known Limitations. Closing it needs either a durable per-member spend record on the Team journal or a synchronous header lookup that does not exist today.

`agent-team` gains two type-only peers, `session-stats` and `token-meter`, for their `SessionProjectionMap` and `SessionProjectionStateMap` merges. Neither is required at runtime.

`session-stats` is mounted by `dsh-web-app` and `token-meter` by `dsh-base`, so the desktop and Web compositions report both. A headless profile mounting neither reports no effort, which is correct rather than degraded.

## Testing

The package suite covers a Lead reading both units, a live teammate reading its own Session rather than the Lead's, each unit present without the other, neither present, and a member the runtime is no longer holding. The client suite covers each duration and token magnitude the card can print — milliseconds, seconds, minutes-and-seconds, thousands, and millions — a member whose provider served no cache, and a member the roster reports no effort for at all.
