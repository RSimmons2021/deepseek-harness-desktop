/**
 * Built-in ways to staff a Team, and the step that turns one into a spawn.
 *
 * A role is the difference between "compose a name, a label, an opening prompt,
 * and a context mode" and "this is a reviewer; here is what to review". None of
 * them names a model: a role's route is a deployment fact, so the shipped set
 * leaves every teammate on the Lead's own model until a deployment says
 * otherwise. That is the whole of how routing avoids costing quality — nothing
 * is moved to a smaller model by default.
 */
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm/brand'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import { TeamError } from './error.ts'
import type { TeamRole, TeamRoleRoute } from './types.ts'

/**
 * Project one role's route onto the child Agent's options.
 *
 * Each field is omitted rather than passed as `undefined`, because an omitted
 * option inherits the parent's while a present one overrides it. The effort id
 * is adapter-owned and validated by the LLM service at request time, so it is
 * branded here rather than checked.
 * @param route - the role's provider, model, and effort.
 * @returns the host-Agent options for that route.
 */
export function agentOptionsOf(route: TeamRoleRoute): AgentOptions {
  return {
    ...route.provider === undefined ? {} : { provider: route.provider },
    ...route.model === undefined ? {} : { model: route.model },
    ...route.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) },
  }
}

/**
 * The roles a Team has when a deployment configures none.
 *
 * They are the parts a Lead cannot do at the same time as the work: deciding
 * what the work is, doing a piece of it, reading it back, and finding out
 * something the Lead does not know.
 */
export const DEFAULT_TEAM_ROLES: readonly TeamRole[] = [
  {
    id: 'planner',
    name: 'planner',
    description: 'Breaks the work into shared tasks',
    brief: [
      'You plan; you do not implement.',
      'Read the workspace and the conversation, then put the work on the shared task board:',
      'one task per piece that can be finished and reviewed on its own, with the write scopes',
      'it will touch and the tasks it waits for. Say what you are unsure about rather than',
      'guessing at it. When the board reflects the work, stop and report.',
    ].join(' '),
    // The plan has to agree with what has already been decided, so this role
    // starts from the Lead's completed prefix rather than from nothing.
    context: 'fork',
  },
  {
    id: 'implementer',
    name: 'implementer',
    description: 'Takes one task and finishes it',
    brief: [
      'Take the task you are given and finish it, staying inside the write scopes it claims.',
      'Another member holds the scopes of any other in-progress task, so if you need a path',
      'outside yours, message its owner rather than writing there. Report what you changed',
      'and what you could not.',
    ].join(' '),
    context: 'fresh',
  },
  {
    id: 'reviewer',
    name: 'reviewer',
    description: 'Reads the work back and reports',
    brief: [
      'You review; you do not fix.',
      'Read what has changed and report what is wrong with it: correctness first, then anything',
      'that would surprise the next reader. For each finding give the file, the line, and the',
      'input that makes it fail. Say plainly when you found nothing.',
    ].join(' '),
    context: 'fresh',
  },
  {
    id: 'researcher',
    name: 'researcher',
    description: 'Finds out something the Team does not know',
    brief: [
      'Answer the question you are given from the workspace itself: read the code, the tests,',
      'and the documentation rather than recalling how such things usually work. Quote what you',
      'found and where it is. Say what you could not establish instead of filling the gap.',
    ].join(' '),
    context: 'fresh',
  },
]

/**
 * Validate and normalize one configured role list.
 *
 * Two things are settled here rather than at spawn time. A duplicate id makes
 * the second role unreachable, and the list is self-contained config, so it
 * fails at load. And a route whose every field is open is the same fact as no
 * route at all — the config schema materializes the object either way — so it
 * is dropped, and `route === undefined` keeps meaning "runs on the Lead's".
 * @param roles - the configured or built-in role list.
 * @returns the same roles, with empty routes removed.
 */
export function resolveRoles(roles: readonly TeamRole[]): readonly TeamRole[] {
  const seen = new Set<string>()
  return roles.map((role) => {
    if (seen.has(role.id)) throw new TeamError(`Team role id "${role.id}" is declared twice`, 'TEAM_ROLE_DUPLICATE')
    seen.add(role.id)
    const route = role.route
    if (route === undefined) return role
    const routed = route.provider !== undefined || route.model !== undefined || route.reasoningEffort !== undefined
    if (routed) return role
    const { route: _dropped, ...rest } = role
    return rest
  })
}

/** A resolved teammate creation: every field the roster needs, none of them optional. */
export interface ResolvedSpawn {
  readonly name: string
  readonly description: string
  readonly prompt: string
  readonly context: 'fresh' | 'fork'
  readonly roleId: string | undefined
  readonly route: TeamRole['route']
}

/** What a spawn request supplies before a role fills the rest in. */
export interface SpawnDefaults {
  readonly role?: string
  readonly name?: string
  readonly description?: string
  readonly prompt: string
  readonly context?: 'fresh' | 'fork'
}

/**
 * Derive a name that is not already in this Team.
 *
 * A role's stem is the name every teammate of that role would want, so the
 * second one takes `-2` rather than failing on a name collision the caller did
 * not choose and cannot see.
 * @param stem - the role's name stem.
 * @param taken - names this Team has already used, which it never reuses.
 * @returns the stem, or the stem with the lowest free suffix.
 */
export function uniqueMemberName(stem: string, taken: ReadonlySet<string>): string {
  if (!taken.has(stem)) return stem
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem}-${String(suffix)}`
    if (!taken.has(candidate)) return candidate
  }
}

/**
 * Resolve one spawn request against the configured roles.
 *
 * Defaulting happens here rather than inside the spawn, so what a teammate was
 * created with is one value the caller can read back rather than something the
 * roster decided on its way past.
 * @param request - what the caller supplied.
 * @param roles - the configured roles.
 * @param taken - names this Team has already used.
 * @returns the complete creation, or a message naming what is missing.
 */
export function resolveSpawn(
  request: SpawnDefaults,
  roles: readonly TeamRole[],
  taken: ReadonlySet<string>,
): { readonly ok: true; readonly value: ResolvedSpawn } | { readonly ok: false; readonly message: string } {
  if (request.role === undefined) {
    // A hand-composed teammate has to name itself and say what it is for; a
    // context mode it does not state is the one a teammate without history
    // starts in, which is what composing one by hand has always meant.
    if (request.name === undefined || request.description === undefined) {
      return { ok: false, message: 'a teammate composed without a role needs a name and a description' }
    }
    return {
      ok: true,
      value: {
        name: request.name,
        description: request.description,
        prompt: request.prompt,
        context: request.context ?? 'fresh',
        roleId: undefined,
        route: undefined,
      },
    }
  }
  const role = roles.find(candidate => candidate.id === request.role)
  if (role === undefined) {
    const known = roles.map(candidate => candidate.id).join(', ')
    return { ok: false, message: `unknown Team role "${request.role}"; this Team offers ${known}` }
  }
  return {
    ok: true,
    value: {
      name: request.name ?? uniqueMemberName(role.name, taken),
      description: request.description ?? role.description,
      // The brief stands above the work rather than replacing it: the role says
      // what this member is for, and the caller says what to do about it.
      prompt: `${role.brief}\n\n${request.prompt}`,
      context: request.context ?? role.context,
      roleId: role.id,
      route: role.route,
    },
  }
}
