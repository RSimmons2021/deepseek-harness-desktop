/** The companion registers and disposes with its fiber, and asserts nothing. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantService from '@deepseek-ai/dsh-invariants'
import * as WriteLeaseInvariant from '../src/invariant.ts'

describe('Agent Teams write-lease invariant companion', () => {
  it('registers an explained empty installer and removes it on disposal', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantService, { enabled: true })
    const registered: string[] = []
    const register = ctx.invariants.register.bind(ctx.invariants)
    ctx.invariants.register = (name, install) => {
      registered.push(name)
      return register(name, install)
    }

    const fiber = ctx.plugin(WriteLeaseInvariant)
    await fiber.await()
    expect(registered).toEqual(['@deepseek-ai/dsh-experimental-agent-team-write-lease'])
    expect(WriteLeaseInvariant.inject).toEqual(['invariants'])
    await fiber.dispose()
  })
})
