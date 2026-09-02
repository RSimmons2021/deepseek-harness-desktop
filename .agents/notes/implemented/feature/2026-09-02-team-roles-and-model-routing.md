# Agent Note: staffing a Team from a role

Status: implemented

English | [中文](2026-09-02-team-roles-and-model-routing.zh.md)

## Problem

Creating a teammate meant composing four things by hand: a name that had never been used in this Team, a responsibility label, an opening prompt carrying both the standing instruction and the work, and a context mode. Three of the four are the same every time for a given kind of member, and the one that is not — the work — was mixed into the same field as the parts that are.

Nothing carried a model, either. Every teammate ran on the Lead's route, so a Team could not put planning on a larger model and leave execution on a smaller one. The seam for it already existed: `SubagentStartRequest.agentOptions` carries provider, model, and reasoning effort, and both in-process providers declare the capability. The Team simply never passed anything.

## Decision

**A role carries everything except the work.** A name stem, a short responsibility, a standing brief, a context mode, and optionally a route. Creating a teammate is naming a role and describing the task; the brief stands above the task rather than replacing it, so the role says what this member is for and the caller says what to do about it.

**The Team derives the name.** A role's stem is what every teammate of that role would be called, so the second one is `reviewer-2` rather than a collision on a name the caller never chose and cannot see. A name the reader does supply still wins, for the Team that holds several of one role and wants to say which is which.

**Which models a deployment has is a deployment fact.** `Config.roles` replaces the built-in set entirely. **No built-in role names a model**, so a Team that configures nothing runs entirely on the Lead's route. That is the whole of how routing avoids costing quality: nothing is moved to a smaller model unless someone says so, and an omitted field on a route inherits rather than overriding.

**Resolution has one home.** `resolveSpawn` is a pure function over (request, roles, taken names), called by the service's `staffTeammate`, which the browser Remote and the model-facing tool both reach. A role means the same thing to both, and what a teammate was created with is a value the caller can read back rather than something the roster decided on its way past.

**The route is durable.** It is recorded on the member row, not read from the live Agent. A teammate that has finished its turn has no live Agent, and the roster's `live?.options.model ?? root.options.model` fallback then reported the *Lead's* model for a teammate that is routed elsewhere — a false statement about where work is running. The order is now live Agent, then the recorded route, then the Lead.

**The form offers the roles rather than hiding them.** Every role is on screen with what it is for, because choosing between four things the reader has never seen is not a job for a control that shows one at a time. The chosen role names the history its teammates start from and the model they run on, since both change what the reader is about to get.

## Alternatives considered

**Inferring a model tier from the work.** Rejected outright. An automatic downgrade is exactly how quality gets lost silently, and the request was explicit that it must not be. A role is a decision someone made once, visible on the card afterwards.

**Shipping built-in roles that name models.** Rejected: this repository does not know which models a deployment has. A shipped `route` would be a guess that either fails at request time or quietly moves work somewhere worse.

**Keeping the name, description, and context fields in the form beside the role.** Rejected for the two the role always supplies; kept for the name, which has a real case. Reducing four fields to one choice and one field was the point.

**Letting the tool's `role` parameter accept any string.** The enum is the Team's own role ids, so a role that does not exist is refused as an invalid argument before the service is asked. A Team that configures no roles offers no enum at all, because an empty one is not a schema any provider accepts.

## Consequences

`TeamMemberSnapshot` gains two optional fields, so the package's own runtime invariant and the `type-equiv` block in the subsystem page both had to learn them. The invariant caught the change on the first run, which is what it is for.

A hand-composed teammate needs a name and a description but not a context mode: dropping the tool's long-standing `fresh` default was a regression the existing tool tests caught immediately, and it is restored in the resolve step where the rest of the defaulting lives.

`list_agents` reports `roleId`, so the model can see which member is which kind. The tool's output schema rejects undeclared properties, which is how the missing field was found.

## Testing

`roles.spec.ts` covers name derivation, route projection, and every resolve path including both rejections. Host tests staff a teammate from a role and assert the roster reports the role's model for it once it has gone idle — the case the durable route exists for — plus the duplicate-id load failure and the membership precondition on reading roles. Tool tests assert the model-facing description names each role and what it is for, that the enum refuses an unknown one, and that a Team with no roles says so. Client tests assert the form sends a role and the work and nothing else, that a name is sent only when overridden, and that nothing can be staffed before a role is chosen.
