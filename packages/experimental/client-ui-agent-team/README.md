---
description: "Use and debug the experimental Web Agent Teams workspace, shared task board, and teammate navigation."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-agent-team

English | [中文](README.zh.md)

## Summary

This package adds an Agent Teams action to the Web conversation header. Opening it presents a full-screen collaborative workspace where a user can inspect the current roster, manage the shared task board, and navigate into a teammate's conversation. It reads authoritative Team state through the generated `ctx.remote.agentTeams` contribution and keeps ordinary child-history navigation on the stable addressed-subagent path. Choose it for the experimental source-checkout Web profile; official releases exclude it. The browser projection does not extend the stable API Proxy, store Team state, or register model-facing input.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Install the package through [`@deepseek-ai/dsh-experimental-agent-team-web-profile`](../agent-team-web-profile/README.md) after the stable Web bundle and the Host-side Agent Teams profile. The Web Client loader mounts the `/client` export; the root Host export is inert, and the package has no user configuration fields.

### Inspect and navigate the roster

Creating a teammate is choosing a role and describing the work. The open seat's form lists every role the Team offers with what each is for, rather than hiding them behind a control that shows one at a time, and the chosen role names the history its teammates start from and the model they run on — both change what the reader is about to get. Nothing else is typed: the name, the responsibility label, the standing brief, and the context mode all come from the role. A name field remains for the case where a Team holds several of one role and the reader wants to say which is which; leaving it empty means the Team derives one. A roster card shows the role a member was staffed from in place of the generic word, because `reviewer` says more than `teammate` does.

Opening the workspace calls `agentTeams/view`. Roster cards show durable names, runtime status, model, diagnostics, and current task ownership. A card's role label and status keep two rows at every width rather than sharing one when there is room: sharing meant the status changed rows partway through the card's own width animation, and a reflow is the one thing a transition cannot carry. A card carries the member's own mark rather than a portrait no agent has: the initials of the role its name states, one letter per hyphenated word, upright inside whichever seat shape it was dealt. Pointer hover or keyboard focus previews one card through shared-layout motion while neighboring cards preserve spatial continuity, and clicking latches it open until it is clicked again — hover alone is lost whenever the pointer ends up outside a card that is still growing under it. Touch input does not synthesize hover, and reduced-motion preference removes spatial animation. Opening a teammate's conversation is its own control rather than the card's click, so reading a member can no longer navigate away from the workspace by accident. A card hosting a composer takes its room from the empty seats beside it rather than from the other members, whose names would otherwise truncate while the reader is composing about them. The detail a card uncovers opens and closes by height rather than only by opacity, so the name and model line above it travel with it instead of snapping when it leaves the flow. A member that is running or provisioning animates its glyph — the inner ring sweeps, its marker orbits, and a ripple leaves the shape — so motion on the roster means work is happening rather than decorating every card equally; an idle, failed, or inactive member keeps the still shape, and reduced motion keeps all of them still. Empty capacity appears as inert open seats rather than fabricated Team members. The tail sits in a viewport whose height does not depend on how many lines have arrived, because they arrive from their own read after the card has already opened: a region that grew then would shove the member's name up the card every time a teammate recorded something. An expanded card names undelivered mail waiting for that member and why it is still waiting, since a quiet message never starts an idle one. Queueing a message and interrupting a turn are acknowledged in a line above the roster that leaves on its own: neither is otherwise visible on the card, and a banner that stays stops being read, so the next one to arrive would land in a slot the reader has already tuned out. It also tails that member's most recent recorded work — its prose, the tools it ran, and what they returned, newest first and cut to fit — refreshed on the same change signal that reloads the board rather than on a timer of its own, and dropped as soon as the card collapses. It also names what that member has spent — turns, model and tool time, and input, output, and cache-read tokens — whenever the roster reports it; cached input is named only when the provider served some, because a zero there is a different fact from having no cache. Selecting a healthy teammate refreshes the existing direct-child catalog and opens the ordinary `{ parentSessionId, childSessionId, mode: 'continuable' }` address. The children a turn spawns through the task tool are not Team members and so have no roster card, which used to leave the workspace with no sign of them at all — their count lived only in the conversation header, and a gauntlet loop looked idle. A branch under the roster answers for them: a stem off the lead card, a rail, and one node per child, numbered in catalog order and labelled with the child's own creation label. A node pulses while its child runs and settles when it stops, and one whose child has children of its own carries a second ring rather than drawing that depth. Only `child` rows become nodes; a `diagnostic` row names a candidate the catalog could not read, which is real but is not an agent to draw. Clicking a settled or continuable node opens that child on the same addressed-subagent path a teammate uses. The stem aligns under the lead card from the roster's own flex arithmetic — cell width is `(100% - (columns - 1) * gap) / columns` — so it needs no measurement and stays aligned at every width. The branch observes the catalog while the workspace is mounted, because the catalog is pulled rather than pushed and would otherwise only hold what some other surface had fetched. History and later human prompts continue through the stable addressed-subagent conversation path; this package adds no Team-specific address field.

### Manage the task board

The board is grouped into the lanes its own derived readiness implies — in progress, ready, blocked, done — so what is running, what can start, and what is waiting on something else separate at a glance; a task states its readiness through the lane it sits in rather than repeating it per card. Blockers name the tasks they are, not their ids. Beneath the board, a write-scope map lists every scope an unfinished task claims with the members claiming it, and marks the ones more than one member holds: scopes are advisory rather than locks, so this is the only place an overlap is visible before two members edit the same paths.

The task board shows task identity, owner, blockers, readiness, advisory write scopes, and overlap warnings. A user can create, edit, assign or unassign, complete, reopen, and delete tasks through `agentTeams/createTask` and `agentTeams/updateTask`. Dependencies are chosen from the board by subject rather than typed as ids, because an id is something the board never shows and the reader would have to go and find; a task is never offered itself. Write scopes are added one path at a time and removed as chips, so editing a task keeps the scopes it already claimed instead of requiring the whole list to be retyped. Tail lines reveal in sequence as they arrive. A completion that lands while the workspace is open marks its card once: finishing a task is what the board exists to produce, and a status word changing is the whole of what it otherwise looks like. Opening a workspace marks nothing, because what was already finished is not news. Every update sends the displayed revision, and create or update rejections remain explicit business results.

### Read what has happened

Beneath the board a timeline lists what the Team has recorded, newest first, through `agentTeams/activity`. Each row names when the change was recorded, which kind it was, the teammate or task it concerns, and the state it reached. Nothing in the timeline animates: every row is something that already happened, and a live marker there would claim work is still running that finished before the reader arrived. Colour separates a failure from a settled change and from the rest. A completed task and a delivered message leave no other trace on the board, so this is the only place they survive. The timeline does not claim the Team has done nothing until its first read answers; before that it says it is reading, because the sentence is about a question that has not come back. A row recorded since the last read is marked briefly when it arrives, which is what says the record is where an action went rather than leaving the reader to find it among rows that all look equally recent. A phase or status this build has no copy for shows its recorded value rather than dropping the row.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Client export mounts the generated `ctx.remote.agentTeams` contribution from [`@deepseek-ai/dsh-experimental-agent-team/remote`](../agent-team/README.md), then registers its locale dictionaries and one conversation-header slot through Cordis effects. Disposing the plugin fiber removes both registrations.

While the surface is open it follows one `agentTeams/follow` stream through the Gateway, which owns reconnection across carrier generations and cancels on disposal — so this surface owns no retry loop, and closing it ends the Host-side wait rather than leaving one outstanding. Every frame carries the whole view and replaces the board. A terminal stream failure is reported and leaves the manual refresh as the way back, and a frame or failure arriving after the conversation has moved to another session is dropped. The recorded history follows the view rather than the transport: whatever produced a new board, followed or refreshed, is what makes the timeline worth re-reading. Two components are adapted from [prompt-kit](https://www.prompt-kit.com): `TextShimmer` marks a teammate the host is still provisioning, and `Loader` stands in for the roster while the first view loads. prompt-kit ships shadcn/ui components built on Tailwind, which this client does not use, so they are reimplementations against the same public contract rather than an install: CSS modules and theme tokens in place of utility classes, and localized copy passed in by the caller instead of literals. `TextShimmer` keeps the original `duration` and `spread` props, including the 5..45 clamp; `Loader` carries only the `dots` and `typing` variants of the original twelve, because a variant with no consumer here would be an unowned public choice.

As the desktop surface the workspace toolbar also carries an appearance control beside the motion pause: it reads the resolved scheme from the theme runtime and writes the opposite one as the durable preference, so it never becomes a second source of theme state. Spawning is offered only once the Team has work to delegate — a task on the board, or a member already running — because the name a spawn takes is permanent and never reused, and a fresh workspace should not make that its most prominent live control. Until then the first seat says so. The spawn form states the permanence and reports its own progress, since the call is held until the teammate reaches a durable active or failed edge. An interrupt and a queued message each leave a short acknowledgement, because neither is otherwise visible on the card between polls. A member whose assigned tasks carry write-scope overlap warnings shows that on the roster rather than only inside the task, since scopes are advisory rather than locks.

A running teammate card carries an interrupt control beside the card button — never inside it, because the card button is the open-teammate target and a button cannot nest.

Starting a create or update invalidates older refreshes. Success reloads the complete Team view so every task's derived fields stay current. A `team-task-conflict` result displays a stale-state notice only after that reload succeeds; a reload failure remains visible instead. Editing task text or scopes and changing dependencies use two sequential compare-and-set mutations because the Team service exposes them as separate actions.

| File | Role |
|---|---|
| [`src/client/mount.ts`](src/client/mount.ts) | Generated Remote, locale, navigation, and slot registrations |
| [`src/client/TeamAction.tsx`](src/client/TeamAction.tsx) | Workspace, shared-layout roster motion, and task-board interaction state |
| [`src/client/locales.ts`](src/client/locales.ts) | English and Chinese panel copy |
| [`src/index.ts`](src/index.ts) | Inert Host entry |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Agent Teams Web profile](../agent-team-web-profile/README.md) — the source-checkout bundle that mounts this Client plugin.
- [Agent Teams service](../agent-team/README.md) — authoritative roster, task, and Remote behavior.
- [Conversation UI](../../client/ui-conversation/README.md) — the stable header slot and addressed-subagent navigation surface.
- [Experimental packages](../README.md) — incubation status and release exclusion.

-----

<a id="model-experience"></a>
## Model Experience

None, as this browser projection and task control surface registers no model-facing input.

#### KV Cache effect

No direct effect; the Team tools and ordinary conversation submission own any later model-visible use.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Snapshot refresh** — the workspace refreshes on open, explicit refresh, and mutations; it has no live event subscription or mailbox timeline.
- **Ordinary child continuation** — a human message sent after navigation uses the stable addressed-subagent prompt path, not the Team peer mailbox.
- **No lifecycle or workspace controls** — the panel cannot spawn, rename, delete, or interrupt teammates, and write scopes remain advisory metadata.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. RPC is authoritative and the package owns only one disposable slot registration.
