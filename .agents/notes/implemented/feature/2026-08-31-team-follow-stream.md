# Agent Note: The Team's live updates become a stream

Status: implemented

English | [中文](2026-08-31-team-follow-stream.zh.md)

## Problem

The browser followed a Team by long polling. `agentTeams/waitForChange` held one bounded wait, and the workspace re-issued it and reloaded the view every time it resolved with a change.

The method's own contract recorded what that cost: "the wire carries no cancellation, so the bounded timeout is the only end of the wait: a browser that disconnects leaves one wait outstanding until it expires." A user closing a tab, a reload, a network drop — each left a registered waiter on the Host for up to its full timeout, and each reconnect added another. The surface also owned a retry loop it should never have had to write, and every observed change cost a second round trip to fetch the view the Host had just decided had changed.

## Decision

**`follow` is a stream, and the carrier owns its cancellation.** `@Remote({ mode: 'stream' })` was already the mechanism the Session and Workspace controllers use for exactly this shape. A disconnected browser now ends its Host-side wait immediately, because the stream carrier aborts the signal the generator is waiting on. Nothing is left registered.

**Every frame carries the whole view.** The opening frame is the view, and each later frame is the view again. This Team's view is a roster and a task board; recomputing it costs less than an increment vocabulary the surface would have to fold, and a client that replaces its view on every frame cannot drift from the Host. It also removes the second round trip: a change and the view it produced arrive together.

**The discriminant survives anyway.** `baseline` and `update` are handled identically today, but `RemoteSnapshotStream` needs to know which frame opens a generation, and a reconnecting client needs to know it has something to show. The two tags are what the transport reads, not a distinction the surface acts on.

**The browser's `waitForChange` Remote is gone; the service method stays.** The model-facing tool calls `ctx.agentTeams.waitForChange(caller, timeoutMs, exec.signal)` with its own cancellation and is unaffected. Only the Remote wrapper — the one that had to fabricate an `AbortController` because the wire carried none — is removed. The pre-release stance says to remove a superseded path rather than keep it beside its replacement.

**The surface owns no retry loop.** The Gateway reopens across carrier generations and the surface holds one logical stream, started when it opens and disposed when it closes or switches sessions. A terminal failure is reported and leaves the manual refresh as the way back, which is what the old loop's transport failure did.

**The history follows the view, not the transport.** Reading the recorded activity used to live inside the reload. It is now its own effect keyed on the view, so whatever produced a new board — a followed frame or the manual refresh — is what makes the timeline worth re-reading. The tail already worked this way.

## Alternatives considered

**Keep the poll and shorten its timeout.** Rejected: it trades leaked waiters for request volume, and it cannot fix the leak, only shorten it.

**Send increments rather than whole views.** Rejected for this Team. An increment vocabulary needs a fold on the client, gap detection, and a resynchronization path when a generation is replaced — all to save bytes on a view that is a handful of roster rows and tasks.

**Fold the activity and tail reads into the stream.** Rejected: they are separately bounded reads with their own limits, and a client that expands no card should not receive tail frames it will not render.

**Keep `waitForChange` as a Remote beside `follow`.** Rejected under the pre-release stance. Two live-update seams would need two sets of tests and would let a consumer pick the one with the leak.

## Consequences

`agentTeams/waitForChange` no longer exists on the wire. Any consumer outside this repository following a Team by polling must move to `follow`; inside it, the browser was the only one.

The client package now depends on `@deepseek-ai/dsh-api-gateway` for `RemoteSnapshotStream` and the `$stream` factory, which is the same dependency the Session and Workspace clients take for the same reason.

The surface still calls `load()` when it opens, when the refresh button is pressed, and after a mutation, so a slow stream never leaves the panel blank and a mutation's result is visible before the frame confirming it arrives. The stream's opening frame then replaces that view with the same content.

A follow is stopped when the surface closes and when the conversation switches sessions, so a session change is two disposals and one new stream rather than a leaked one.

## Testing

The Host suite covers the opening frame carrying the current view, a change producing an update frame, the carrier's cancellation ending the follow rather than a timeout, a wait that parked without a change producing no frame, a change that settles after cancellation reaching nobody, and a wait failure that is not the carrier cancelling being reported. The client suite drives the plugin's binding through the Gateway's own `RemoteStream` over an available connection: the opening view and a later one taken the same way, the follow addressing the Lead rather than the teammate conversation, a generation that ends after its opening view and one that ends before it classified distinctly, and disposal on demand. The surface suite covers a followed view replacing the board without another read, a terminal failure surfacing, a frame and a failure arriving for a session it has left being dropped, and the follow being stopped on both a session switch and a close.
