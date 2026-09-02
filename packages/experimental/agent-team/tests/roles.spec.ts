import { describe, expect, it } from 'vitest'
import { agentOptionsOf, DEFAULT_TEAM_ROLES, resolveSpawn, uniqueMemberName } from '../src/roles.ts'
import type { TeamRole } from '../src/types.ts'

const ROLES: readonly TeamRole[] = [
  { id: 'reviewer', name: 'reviewer', description: 'Reads it back', brief: 'You review.', context: 'fresh' },
  {
    id: 'planner',
    name: 'planner',
    description: 'Breaks the work up',
    brief: 'You plan.',
    context: 'fork',
    route: { model: 'big-model', reasoningEffort: 'high' },
  },
]

describe('uniqueMemberName', () => {
  it('takes the stem, then the lowest free suffix', () => {
    expect(uniqueMemberName('reviewer', new Set())).toBe('reviewer')
    expect(uniqueMemberName('reviewer', new Set(['reviewer']))).toBe('reviewer-2')
    expect(uniqueMemberName('reviewer', new Set(['reviewer', 'reviewer-2']))).toBe('reviewer-3')
    // A Team never reuses a name, so a gap left by a departed member stays a gap.
    expect(uniqueMemberName('reviewer', new Set(['reviewer', 'reviewer-3']))).toBe('reviewer-2')
  })
})

describe('agentOptionsOf', () => {
  it('omits what the role leaves open, because an omitted option inherits the Lead’s', () => {
    expect(agentOptionsOf({})).toEqual({})
    expect(agentOptionsOf({ model: 'small' })).toEqual({ model: 'small' })
    expect(agentOptionsOf({ provider: 'p', model: 'm', reasoningEffort: 'high' }))
      .toEqual({ provider: 'p', model: 'm', reasoningEffort: 'high' })
  })
})

describe('resolveSpawn', () => {
  it('fills the name, the label, the context, and the route from the role', () => {
    const resolved = resolveSpawn({ role: 'planner', prompt: 'split the migration up' }, ROLES, new Set())
    expect(resolved).toEqual({
      ok: true,
      value: {
        name: 'planner',
        description: 'Breaks the work up',
        // The brief stands above the work rather than replacing it.
        prompt: 'You plan.\n\nsplit the migration up',
        context: 'fork',
        roleId: 'planner',
        route: { model: 'big-model', reasoningEffort: 'high' },
      },
    })
  })

  it('derives a free name so a second teammate of one role is not a collision', () => {
    const resolved = resolveSpawn({ role: 'reviewer', prompt: 'read it' }, ROLES, new Set(['reviewer']))
    expect(resolved.ok && resolved.value.name).toBe('reviewer-2')
  })

  it('lets an explicit field win over the role that would have supplied it', () => {
    const resolved = resolveSpawn(
      { role: 'reviewer', name: 'second-pair-of-eyes', description: 'Security pass', context: 'fork', prompt: 'read it' },
      ROLES,
      new Set(),
    )
    expect(resolved.ok && resolved.value).toMatchObject({
      name: 'second-pair-of-eyes',
      description: 'Security pass',
      context: 'fork',
    })
    // The brief still applies: overriding the label does not drop what the role is for.
    expect(resolved.ok && resolved.value.prompt).toBe('You review.\n\nread it')
  })

  it('leaves a hand-composed teammate on the Lead’s route', () => {
    const resolved = resolveSpawn(
      { name: 'writer', description: 'Writes', context: 'fresh', prompt: 'draft it' },
      ROLES,
      new Set(),
    )
    expect(resolved).toEqual({
      ok: true,
      value: {
        name: 'writer', description: 'Writes', prompt: 'draft it', context: 'fresh',
        roleId: undefined, route: undefined,
      },
    })
  })

  it('names what is missing rather than inventing it', () => {
    const resolved = resolveSpawn({ name: 'writer', prompt: 'draft it' }, ROLES, new Set())
    expect(resolved).toEqual({
      ok: false,
      message: 'a teammate composed without a role needs a name and a description',
    })
  })

  it('starts a hand-composed teammate without history unless it says otherwise', () => {
    const resolved = resolveSpawn({ name: 'writer', description: 'Writes', prompt: 'draft it' }, ROLES, new Set())
    expect(resolved.ok && resolved.value.context).toBe('fresh')
  })

  it('names the roles this Team does offer when asked for one it does not', () => {
    const resolved = resolveSpawn({ role: 'tester', prompt: 'test it' }, ROLES, new Set())
    expect(resolved).toEqual({
      ok: false,
      message: 'unknown Team role "tester"; this Team offers reviewer, planner',
    })
  })
})

describe('DEFAULT_TEAM_ROLES', () => {
  it('names no model, so a Team that configures nothing runs entirely on the Lead’s', () => {
    // This is the whole of how role routing avoids costing quality: a role is
    // moved to another model only when a deployment says so.
    expect(DEFAULT_TEAM_ROLES.every(role => role.route === undefined)).toBe(true)
  })

  it('offers distinct ids, since a spawn resolves a role by id', () => {
    const ids = DEFAULT_TEAM_ROLES.map(role => role.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('starts the planner from the Lead’s prefix and the rest from nothing', () => {
    // A plan has to agree with what has already been decided; the others are
    // given their work in full and do not need the conversation that produced it.
    const byId = new Map(DEFAULT_TEAM_ROLES.map(role => [role.id, role]))
    expect(byId.get('planner')?.context).toBe('fork')
    expect(byId.get('implementer')?.context).toBe('fresh')
    expect(byId.get('reviewer')?.context).toBe('fresh')
    expect(byId.get('researcher')?.context).toBe('fresh')
  })
})
