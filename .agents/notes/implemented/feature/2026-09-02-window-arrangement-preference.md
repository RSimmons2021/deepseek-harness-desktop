# Agent Note: naming the window's arrangement

Status: implemented

English | [中文](2026-09-02-window-arrangement-preference.zh.md)

## Problem

Every seam in the desktop window became draggable, which made the layout adjustable and left it undiscoverable: reaching a workspace-first window meant collapsing the session rail and dragging the conversation to its floor, and reaching it again after a reload meant doing both once more. Panel geometry is deliberately transient — nothing about a dragged width survives a reload — so there was no arrangement to return to, only widths to redo.

## Decision

**The arrangement is a preference; the widths it produces are not.** Four named arrangements — `balanced`, `workspace`, `conversation`, `everything` — live in a durable `ui-layout` settings section, and the widths each one writes stay transient. Reopening the app restores the arrangement the reader chose, not a geometry they nudged once. That is a rule that can be stated in one sentence, which is why it is the one worth having.

**A preset writes preferences, not resolved tracks.** It sets the same width preferences a drag would, so the concession chain answers identically: an arrangement asking for more than the window has degrades the way those widths always degrade, and no preset needs to know the window's size.

**Dragging afterwards does not rename the arrangement.** A preset is where the layout starts, not a mode it stays in. Clearing the name on the first drag would leave the settings row showing nothing at all, which says less than a slightly stale name does.

**Choosing rearranges before it persists.** The window moves on the same gesture that chose it; the write to the Host is what happens afterwards. An arrangement adopted *from* the Host is applied without being written back, which is what lets it survive the reload it exists for.

## Alternatives considered

**Persisting the widths themselves.** Rejected, and it is the obvious thing to do. Panel geometry is transient by design, and reload restoring a width someone dragged once while reaching for something else is worse than restoring a shape they named on purpose.

**Presets as one-shot actions with nothing stored.** Rejected: rearranging the window and then losing it on reload is the problem, not the solution.

**Presets as modes that lock the columns.** Rejected. The seams became draggable one commit earlier; taking that away in exchange for a name is a bad trade.

## Consequences

`ui-layout` gains a Host half. It had none — `apply` was an intentional no-op — and now registers the durable section beside every other package's, so the arrangement lives in the same document as the rest of the user's preferences rather than in this browser's storage.

The store holds `preset` alongside its widths, so the settings row and the frames read one source. The plugin body stays thin: `bindLayoutPreference` owns the follow-and-apply, which is what made it testable without a slot-registry bench.

`packages/client/ui-layout/src/*` carries a standing coverage exemption, so the new files are not gated by the per-file threshold. They are tested anyway — the preference binding, the preset geometry, the store action, and the settings row each have their own cases.

## Testing

The preference binding is covered directly: publishing before construction, adopting without writing back, ignoring an accepted section that changes nothing, re-applying a repeated choice because the window may have been dragged since, and stopping on disposal. Geometry tests assert each arrangement is a distinct window and that the two named for a column really do hand it the most room, measured through the desktop solver rather than by comparing the numbers the presets contain.
