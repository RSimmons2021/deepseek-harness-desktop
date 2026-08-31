/** The lease decision refuses exactly the writes another member has claimed. */

import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import * as writeLease from '../src/index.ts'

const TARGET = { targetKey: 'k', displayPath: 'packages/api/src/index.ts' } as unknown as FsTarget

async function bench(options: {
  initiator?: Agent | undefined
  refusal?: string | undefined
} = {}) {
  const ctx = new Context()
  const refusals: { agent: Agent; path: string }[] = []
  class Agents extends Service {
    constructor(serviceCtx: Context) { super(serviceCtx, 'agents') }
    currentInitiator(): Agent | undefined { return options.initiator }
  }
  class Teams extends Service {
    constructor(serviceCtx: Context) { super(serviceCtx, 'agentTeams') }
    writeRefusal(agent: Agent, path: string): string | undefined {
      refusals.push({ agent, path })
      return options.refusal
    }
  }
  void new Agents(ctx)
  void new Teams(ctx)
  ctx.provide('fs', {})

  // A decider that occupies the slot without delegating, exactly as the
  // observation policy does: the lease must still run, and must still reach it.
  const downstream = vi.fn(() => Promise.resolve({ kind: 'createIfAbsent' }))
  ctx.on('fs/write-intent', downstream as never)
  ctx.on('fs/edit-intent', downstream as never)

  const fiber = ctx.plugin(writeLease)
  await fiber.await()
  return { ctx, fiber, refusals, downstream }
}

const agent = { id: 'writer' } as unknown as Agent

describe('Agent Teams write lease', () => {
  it('passes an unclaimed write through to the decider behind it', async () => {
    const b = await bench({ initiator: agent })
    await expect(b.ctx.waterfall('fs/write-intent', TARGET, undefined, () => undefined))
      .resolves.toEqual({ kind: 'createIfAbsent' })
    await expect(b.ctx.waterfall('fs/edit-intent', TARGET, undefined, () => undefined))
      .resolves.toEqual({ kind: 'createIfAbsent' })
    expect(b.refusals).toEqual([
      { agent, path: 'packages/api/src/index.ts' },
      { agent, path: 'packages/api/src/index.ts' },
    ])
    expect(b.downstream).toHaveBeenCalledTimes(2)
  })

  it('fails a claimed write and never reaches the decider behind it', async () => {
    const b = await bench({ initiator: agent, refusal: 'packages/api is claimed by task-3' })
    await expect(b.ctx.waterfall('fs/write-intent', TARGET, undefined, () => undefined))
      .rejects.toThrow('write refused: packages/api is claimed by task-3')
    await expect(b.ctx.waterfall('fs/edit-intent', TARGET, undefined, () => undefined))
      .rejects.toThrow('write refused: packages/api is claimed by task-3')
    expect(b.downstream).not.toHaveBeenCalled()
  })

  it('leaves a write with no initiating Agent to the rest of the chain', async () => {
    const b = await bench({ refusal: 'never asked' })
    await expect(b.ctx.waterfall('fs/write-intent', TARGET, undefined, () => undefined))
      .resolves.toEqual({ kind: 'createIfAbsent' })
    expect(b.refusals).toEqual([])
  })

  it('removes both decisions when the fiber is disposed', async () => {
    const b = await bench({ initiator: agent, refusal: 'claimed' })
    await b.fiber.dispose()
    await expect(b.ctx.waterfall('fs/write-intent', TARGET, undefined, () => undefined))
      .resolves.toEqual({ kind: 'createIfAbsent' })
    await expect(b.ctx.waterfall('fs/edit-intent', TARGET, undefined, () => undefined))
      .resolves.toEqual({ kind: 'createIfAbsent' })
    expect(b.refusals).toEqual([])
  })
})
