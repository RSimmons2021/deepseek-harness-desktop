# Agent Note: Watching a teammate work

Status: implemented

English | [中文](2026-08-31-team-member-tail.zh.md)

## Problem

The Team workspace could say a teammate was running and nothing about what it was doing. A member's status was a dot; its work was a navigation away in its own conversation, which costs the reader the workspace they were watching. Delegating to four teammates and being told only that four dots are green is not oversight.

The Team already observes every Session event — the mailbox listens on `session/event` to acknowledge deliveries — so the work was passing through the service that had no way to show it.

## Decision

**A tail reads the member's own attached Session log.** `TeamService.remoteTail(agent, memberName, limit)` projects that member's `session.events`, reverses, and slices — the same shape the Team history read uses, on a log that is already in memory. There is no accumulator and nothing to keep in step.

**Attached only, and that is the right scope here.** Unlike a member's spend, which is most interesting after it stops, a tail is for watching a member work — and a member doing work is attached by definition. A member the runtime is not holding answers with nothing, which is the same state its roster row already reports as inactive.

**Three event types, not all of them.** `assistant/message` carries the member's prose, `tool/call` names what it ran, `tool/result` carries what came back. Reasoning blocks, images, and the call/result envelopes are dropped: the first is not the member's answer and the rest have no prose. An assistant step that only called tools produces no line of its own, because the calls it made are their own lines.

**Lines are cut at the service, and say so.** Four hundred UTF-16 units per line, with `truncated: true` when anything was dropped. A card is a summary; the whole transcript is one navigation away, and a tail that silently shortens text teaches the reader to distrust it.

**The change signal grew to include member work.** `waitForChange` was released by roster, task, mailbox, and live-status edges — none of which fire while a member talks, so a tail on that signal would have been stale until something else happened. The `session/event` observer now also releases Team waiters for exactly the three types a tail shows. That bounds the rate: a streaming member releases the wait a few times per step rather than once per token, and no new transport is involved.

**A result line does not name its tool.** A `ToolResultBlock` carries its call id, not the tool's name, and the `tool/call` line sits directly beside it in the tail already naming it. Correlating them would only repeat what the reader can see.

## Alternatives considered

**Replace the long poll with an event stream.** Not needed for this. The tail's requirement was that a member's work releases the wait, which is a signal change, not a transport change. `waitForChange` already returns promptly on notify; a stream would replace a working mechanism to deliver the same lines.

**Poll the tail on its own timer while a card is expanded.** Rejected: a second cadence beside the board's would let the two disagree about the same moment, and it would keep polling a member that has stopped.

**Include every event type and let the client filter.** Rejected: the wire would carry chunks and request headers the surface never shows, and the per-line cut would have nothing to apply to.

**Stream the member's chunks as they arrive.** Rejected for now. It is a genuinely different feature — a live transcript rather than a tail — and it needs the transport this change deliberately did not build. The complete assistant message arriving a step later is what a roster card can usefully show.

## Consequences

A member that produces very long single lines shows the first four hundred units of each and says it cut them. The limit is not configurable: it is a presentation choice this service makes for every consumer, and a caller that needs the full text has the member's own conversation.

`waitForChange` now fires more often. Every surface following a Team reloads its view when any member records a message, a call, or a result — cheap reads, but more of them. A deployment watching an idle Team sees no change in behaviour.

The tail is dropped when a card collapses rather than cached, so re-expanding a card re-reads it. That keeps one expanded card's worth of member log in memory instead of every member's.

## Testing

The projection is covered per event type: prose with reasoning and images beside it, a tool-only assistant step, a reasoning-only step, a call with its arguments, a line cut at the cap, a result read through its nested text, and an event no tail shows. The Remote is covered against a real Team: a live member's three lines newest-first, the limit truncating, the Lead by its own name, an unknown name, every out-of-range limit, and a member the runtime has released. The change signal is covered from both sides — an event a tail shows releases an outstanding wait, an event it does not leaves the wait outstanding, and a Session with no live Agent behind it releases nothing. The client covers the expanded card's tail, its truncation marker, the empty state, a refused tail leaving the rest of the card alone, and the tail being dropped when the card collapses.
