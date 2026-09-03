# Agent Note: a scope adapter that goes away is not a miswired shell

Status: implemented

English | [中文](2026-09-03-scope-adapter-lifetime.zh.md)

## Problem

`createSlotRenderer().renderRoot` wraps the entire application in `<ScopeProvider scope="session-maybe">`, and that provider threw `SlotAssemblyError` whenever `host.scope(...)` returned nothing. `SlotErrorBoundary` rethrows assembly errors on purpose, and the client mounts through a bare `createRoot` with no boundary above it, so the throw unmounted the whole tree: a blank page that never came back.

The adapter is installed by a plugin, through `ctx.effect`, so its lifetime is that plugin's lifetime. Reloading a patch layer disposes `ui-session`, `installScope`'s disposer deletes the adapter and publishes a scope revision, and the provider re-renders in the gap before the replacement installs. A routine dev reload therefore killed the application. Observed three times in one session on the web profile, which runs `patchReload: 'live'`.

## Decision

**Separate a scope that went away from one that never arrived.** A scope this host has installed at least once is between owners: the provider renders nothing and comes back when the replacement lands. A scope the host has never installed is a composition with no session plugin, which is worth the crash — nothing is coming to close that gap.

`RootOutlet` already draws exactly this line for registrations: entries that all abdicated get a crash face, while `renderSlot('root')` before any registration throws a boot-order assembly error. The provider now matches its neighbour.

**The latch is keyed on the host, not on the component.** A `WeakMap<SlotRendererHost, Set<string>>` survives a remount of the provider and still starts empty for a genuinely new composition, which is what keeps the loud failure loud. Writing it during render matches what `observableHook` already does with `hookCache` in the same file.

**Both paths call one Hook.** The absent path calls `observableHook(absentSource)` so Hook order is identical whether or not the adapter resolves — the trick `useAbsentSnapshot` and `keyedObservableHook` already use here.

## Alternatives considered

**Holding the last binding through the gap.** Rejected: it keeps the tree mounted, which is nicer, but the binding names a Session whose owning plugin is gone, so every consumer would read from a disposed source. Rendering nothing is honest about what is knowable during the gap.

**An error boundary above the root.** It would contain the crash without distinguishing the two cases, so a composition genuinely missing its session plugin would degrade into a blank frame instead of saying so. The diagnostic is worth keeping.

## Consequences

Assembly errors are still fatal by design; this narrows which states count as one. A patch reload now costs the subtree's React state rather than the session.

The reload still leaves `conversation.composer.bar` on its crash face until the next page load: `ui-conversation`'s inject throws `conversation service unavailable` while its own service is between owners. That is a separate defect in a different package, contained by `SlotErrorBoundary` as designed, and it was invisible before because the whole tree died first.

## Testing

Two tests over the renderer's fake host, in the machinery suite that owns `createSlotRenderer`. The first removes an installed adapter and asserts the tree survives, empties, and returns when the adapter does; it fails against the previous implementation. The second mounts a host that never installed the scope and asserts the throw still names it.

Verified live: touching a built client bundle under `patchReload: 'live'` reloads the plugins, and the application now stays mounted through the reload that previously blanked it.
