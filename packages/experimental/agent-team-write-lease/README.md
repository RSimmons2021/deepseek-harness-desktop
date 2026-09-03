---
description: "Refuse a Team member's filesystem write inside a scope another member's in-progress task claims."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-agent-team-write-lease

English | [中文](README.zh.md)

## Summary

`dsh-experimental-agent-team-write-lease` turns an [Agent Teams](../agent-team/README.md) task board's advisory write scopes into refusals. A scope a task claims belongs to that task's owner while the task is in progress, and this plugin fails every other member's write inside it before the filesystem tools reach the backend. Without it a scope overlap is something a Lead reads about after two members have already edited the same paths. Mount it wherever the Team layer runs; the Team profile does.

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

[`@deepseek-ai/dsh-experimental-agent-team-profile`](../agent-team-profile/README.md) mounts it, so a profile carrying that layer already enforces leases. Mount it directly only when composing the Team packages by hand; it takes no configuration.

### What a lease covers

A write is refused when a task is `in_progress`, has an owner other than the writer, and claims a scope covering the path. Everything else passes: an unclaimed path, a claim held by an unstarted or completed task, an unowned task's claim, and the writer's own claim. Enforcement adds exclusion between members without requiring anyone to claim a scope before writing at all, so a Team that never uses write scopes behaves exactly as it did.

Reassigning a task moves its lease with it, and completing the task releases the scope for everyone.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Two listeners on `fs/write-intent` and `fs/edit-intent`, both prepended and both delegating through `next()`. Prepending matters: `dsh-fs-observation-policy` occupies the same single decision slot without delegating, so a lease registered behind it would never run. Delegating matters equally: a lease that answered the waterfall itself would drop the staleness guard that slot exists to produce.

The acting Agent comes from `ctx.agents.currentInitiator()`, not from the seam's `actor`, which the filesystem capability deliberately types as an opaque object. A write with no initiating Agent — anything outside an Agent's driver chain — is left to the rest of the chain.

The decision itself belongs to `TeamService.writeRefusal`, which owns the task board the claims live on. This package contributes only the two registrations and the refusal text the model reads.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The two prepended filesystem decisions |

**Runtime invariant:** No companion is published. This package owns no durable record and no mutable relationship of its own: it contributes two listeners that ask `TeamService.writeRefusal` for a decision, and the Team domain owns the task board that decision reads.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Agent Teams](../agent-team/README.md) — the task board, its write scopes, and `writeRefusal`.
- [Filesystem capability](../../fs/fs/README.md) — the `fs/write-intent` and `fs/edit-intent` decision slots.
- [Agent Teams profile](../agent-team-profile/README.md) — the layer that mounts this plugin.

-----

<a id="model-experience"></a>
## Model Experience

### Refused writes

#### What the model sees

A refused write fails the tool call with `write refused: <path> is inside "<scope>", claimed by task <id> in progress by <owner>`. The text names the path, the claimed scope, the task, and the member holding it, so the model can message that member, take the task over, or work elsewhere without guessing what stopped it.

#### Token effect

None. The plugin registers no tool and adds no prompt text; a refusal costs only the failed call's own result.

#### KV Cache effect

None. Nothing this plugin contributes reaches a request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


- **Only the filesystem tools are covered** — the lease sits on the `fs` tool decision slots, so Bash, formatters, code generators, and any direct `ctx.fs.writeText` caller still write inside another member's scope. This is the same reach the existing version guards have, and the Team's advisory-scope limitation records the same gap.
- **Scope claims are string prefixes** — a scope covers a path by exact match or by `/`-delimited prefix. There is no glob, no symlink resolution, and no normalization beyond what the task board validates on claim, so two spellings of one directory are two scopes.
- **The lease is per-process** — it reads one process's Team state, and the Team's mailbox already documents that concurrent harness processes over one Team are unsupported.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer notes — click to expand</summary>

The package's own suite drives the waterfall against a decider that occupies the slot without delegating, which is the ordering the observation policy actually produces. If that policy ever starts delegating, the prepend stops being load-bearing but stays correct.

`writeRefusal` returns the refusal rather than throwing, so the Team service stays free of the filesystem vocabulary and this package owns the `write refused:` wording the model reads.

</details>
