# Agent Note: what the Team workspace says back

Status: implemented

English | [中文](2026-09-01-team-workspace-feedback-ladder.zh.md)

## Problem

The workspace renders the Team correctly and says almost nothing back. Ranking every action in it by consequence and asking what each one produces exposed a feedback ladder that is flat at both ends.

At the low end: completing a task is what the whole surface exists to produce, and finishing one changes a status word and moves the card to another lane. Nothing else. The record that the completion also lands in gains a row that looks exactly as recent as the eight rows above it, so nothing connects the action to where it went.

At the high end: acknowledging a queued message or an interrupt puts a line above the roster that never leaves. It was cleared only when the conversation switched sessions. A banner that stays stops being read, which is the same failure as having no banner, except that it also occupies the slot the next acknowledgement will arrive in.

Two smaller defects sat underneath. `.notice` was declared twice in the same stylesheet, so the acknowledgement took its box from one rule and its padding from the other and rendered its text against its own border. And the timeline stated `Nothing has happened yet` from the moment the workspace opened, before its first read had answered, then replaced that with rows and pushed the footer down.

## Decision

**Feedback weight matches consequence.** A completion that lands while the workspace is open marks its card once, and the row it produced in the record is marked at the same time. That pairing is the point: the card confirms the action, and the record says where it went. Nothing is marked when a workspace opens — both marks seed from the first read, so what was already finished is not news. Both marks are transient, because each says "just now"; a mark that stayed would mean "at some point", which the timestamps already say better.

**The acknowledgement has an arc.** It arrives on ease-out over 200ms and leaves on ease-in over 140ms, holds for 4.2 seconds, and restarts its hold when a repeat announcement replaces it. Height carries both edges, so the surface below moves under it rather than being displaced in a frame.

**A claim waits for the answer it is about.** The timeline reports that it is reading until its first read comes back, and only then says the Team has done nothing.

**Marks are painted, never laid out.** Each is an absolutely positioned overlay animating opacity alone, inset past the element's own border. Nothing needs `overflow: hidden`, so no focus ring is clipped to make a flash possible.

## Alternatives considered

**Disabling refresh while a load is in flight.** The checklist answer, and wrong here: the surface supports overlapping refreshes on purpose — `refreshGeneration` keeps the newest — and disabling would leave a hung load with no way back. The spin, the relabel to `Loading Team…`, and `aria-busy` already answer the click inside 100ms. A test already described the overlapping behavior; it is current, not obsolete.

**Confetti, or an overshoot curve, on the completion.** Rejected. This is a dense operational board; a bouncy celebration on it reads as unserious, and the ladder only calls for weight above the silent reversible edits around it and below the delete that asks first.

**Reserving the timeline's height so its rows cannot shift the footer.** Rejected: sizing the dock for rows a genuinely quiet Team will never have trades one wrong layout for another. The defect was the false sentence, not the growth.

**Deleting the emphasis under reduced motion.** Rejected. The marks become static instead: present while the surface holds them, gone when it lets go. The state they emphasize is in text either way, so this is emphasis rather than the only channel.

## Consequences

`notice` is a boxed value rather than a bare string, so that announcing the same sentence twice restarts its hold — the state changes identity even when the text does not.

The acknowledgement's hold is proven by waiting it out in a test rather than by faking the clock. Faking `Date`, `performance.now`, or the frame callbacks leaves motion's time base offset once real timers return, and every exit animation in the tests after that one stops finishing; faking `setTimeout` alone breaks the polling that `waitFor` runs on. One test therefore takes about four and a half seconds.

Splitting `.notice` in two removes a duplicate selector: the acknowledgement is its own rule, and the two quiet empty-state lines keep the original.

## Testing

Client tests cover the acknowledgement arriving and leaving on its own; a completion that lands while watching marking its card while one already finished stays unmarked, and the mark then letting go; a timeline row recorded since the last read being marked while a first read marks nothing, and that mark letting go; the timeline withholding its empty claim until the read answers; and the acknowledgement under reduced motion. Lane headings reuse the status words, so the timeline assertions scope to the record rather than the page.
