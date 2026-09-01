# Agent Note: What the Team workspace got wrong while it was running

Status: implemented

English | [中文](2026-09-01-team-workspace-motion-and-controls.zh.md)

## Problem

Five features landed on the Team workspace — a recorded timeline, per-member spend, a tail of a member's work, enforced write scopes, and a follow stream. Running the desktop application against a real Team then showed a set of defects that no test could have named, because each was about how the surface behaved over time rather than what it rendered.

A member's card carried a generic person outline, identical for every member, on a surface whose entire job is to distinguish them. The card animated its width smoothly and then snapped, twice, in two different places. Every timeline row rendered the live pixel-chase marker, so a record of a task that finished ten minutes ago sat there animating as though the work were still running. Expansion was hover-only, and hover is lost whenever the pointer ends up outside a card that is still growing under it — while a click, the obvious way to hold a card open, instead navigated away from the workspace. The header announced a Team name nothing else used and carried a badge asserting something nothing could contradict. Adding a shared task asked for typed task ids and comma-separated paths.

## Decision

**A member is marked by the role its name states.** Teammate names are the roles they were created for, so the initials of the name are the role: `writer` reads W, `code-reviewer` reads CR. It replaces a portrait no agent has and is the one part of the glyph that differs per member rather than per seat position. Distinct pictorial icons were rejected: teammate names are free text the model chooses, so any icon mapping would be guessing.

**Motion means work is happening.** A running or provisioning member sweeps its glyph's inner ring, orbits its marker, and sends a ripple out of the shape. Idle, failed, and inactive members keep the still glyph, so motion on the roster carries state rather than decorating every card equally. Reduced motion stops all of it.

**Nothing in a timeline animates.** Every row is a past fact. The live marker there claimed work was still running that had finished before the reader arrived; a static mark separates a failure from a settled change and from the rest.

**A structural layout change is what a transition cannot carry.** Both jumps were the same class of defect in different places, and neither was a timing problem:

- The detail box left the flow in one frame on collapse while the card was still animating its width. It now opens and closes by height, margin, and padding together, clipping as it travels.
- The role label and the status shared a wrapping row, so the status changed rows partway through the width animation. They now keep two rows at every width.

A third instance is fixed by removing the change rather than animating it: the tail's lines arrive from their own read after the card has opened, so the tail sits in a viewport whose height does not depend on how many lines have arrived.

**Expansion latches on click; navigation is its own control.** A click holds a card open until it is clicked again, and releasing drops the hover preview so the click that released it cannot hold it open through the focus it just took. Opening a teammate's conversation moved to a control beside message and interrupt, so reading a member can no longer leave the workspace by accident. Every card expands, including a failed or provisioning one, because its detail is where the diagnostic lives.

**A task is built from the board.** A dependency is chosen by subject from the tasks that exist — an id is a value the board never shows, so it was something the reader had to go and find — and a task is never offered itself. Write scopes are added one path at a time and removed as chips, which also means editing a task keeps the scopes it already claimed instead of requiring the whole list to be retyped.

## Alternatives considered

**`layout` on the detail box, for the tail's arrival.** This is the textbook answer and it **froze the renderer**. Against the detail's already-animated `height: auto` it feeds back on itself; every screenshot of the page timed out until it was reverted. Nothing else caught it — the tests passed and the typecheck was clean — so it is recorded here rather than left for the next reader to rediscover.

**`:has()` for the composing card's width.** The selector matched (`element.matches()` returned true, the rule was in the page, its specificity won) and the card was still never restyled: Chromium did not invalidate it when the form appeared underneath. Driven by the surface's own state attribute instead, which is how the rest of this component already works.

**Keeping the title and the badge.** Rejected: the workspace only renders for a live session, so the badge asserted something nothing could contradict, and the footer already carries the live indicator. The Team's name is its roster.

**Reserving space for the spend row as well as the tail.** Rejected: absent effort means absent, not zeros, and a placeholder would contradict that.

## Consequences

An expanded card has a constant tail region, so a member that has recorded nothing shows an empty window rather than a single line. That is the price of a card that never moves under the reader.

The role label and status no longer share a row when one would fit, so a wide card has empty space beside the status. Stability at every width was worth more than density at one.

`TeamMemberView.pendingMessages` is required, so every hand-built member view in the client suites carries it.

The board fixture gained a second task, since a dependency needs something to depend on. That made previously unambiguous queries ambiguous — two Edit buttons, two owner selects — so six tests scope their queries to the card they mean. One of them cannot identify that card by subject: the subject changes mid-test, and once the task depends on the other one its card names that one too, so it is found by task id.

## Testing

The client suite covers the monogram for a one-word, hyphenated, and single-character name; the working marker present for running and provisioning members and absent for idle and failed ones; every timeline row's static mark with no live marker anywhere in it; the tail's staged reveal and its reduced-motion form; click latching, releasing, and surviving the pointer leaving the roster; navigation from its own control and its absence for an unreachable teammate; and the task form choosing and unchoosing a blocker, adding scopes by Enter and by button, rejecting a blank one, and removing a chip. The collapse smoothness and the mark's fit are measured in the running application rather than asserted in jsdom, which renders no geometry.
