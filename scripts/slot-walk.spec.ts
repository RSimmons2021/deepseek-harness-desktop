/**
 * What the slot scanner reads from a register call site. The catalog it feeds
 * tells plugin authors which seats are already occupied, so a call shape it
 * cannot read is a seat reported as free.
 */

import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { slotRegistrations } from './slot-walk.ts'
import type { ScannedFile } from './slot-walk.ts'

function scan(source: string): ReturnType<typeof slotRegistrations> {
  const sf = ts.createSourceFile('index.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
  const file: ScannedFile = {
    sf,
    rel: 'packages/client/demo/src/client/index.ts',
    package: '@deepseek-ai/dsh-client-demo',
  }
  return slotRegistrations(file)
}

describe('slot registration scanning', () => {
  it('reads a registration written inline', () => {
    expect(scan(`
      ctx.slots.register({ name: 'root', id: 'demo', children: { 'demo.seat': {} } }, AppFrame)
    `)).toEqual([expect.objectContaining({
      key: 'root',
      id: 'demo',
      children: ['demo.seat'],
      component: 'AppFrame',
    })])
  })

  it('folds a spread seat description so a shared registration stays visible', () => {
    // Two branches sharing one seat description is how the layout registers its
    // frame; reading only the written properties would report `root` as free.
    const found = scan(`
      const seats = { name: 'root', locale: 'common' } as const
      const registered = desktop
        ? ctx.slots.register({ ...seats, children: desktopChildren }, DesktopFrame)
        : ctx.slots.register({ ...seats, children: { 'demo.seat': {} } }, AppFrame)
    `)
    expect(found.map(entry => [entry.key, entry.component])).toEqual([
      ['root', 'DesktopFrame'],
      ['root', 'AppFrame'],
    ])
    expect(found[1]?.children).toEqual(['demo.seat'])
  })

  it('lets a written property win over the one it spreads', () => {
    expect(scan(`
      const seats = { name: 'root' }
      ctx.slots.register({ ...seats, name: 'sidebar' }, Panel)
    `)).toEqual([expect.objectContaining({ key: 'sidebar' })])
  })

  it('skips a call whose options it cannot read', () => {
    // A spread of something this scanner cannot resolve, and a non-literal
    // argument, both leave the registration unnamed rather than half-read.
    expect(scan('ctx.slots.register({ ...fromElsewhere() }, Panel)')).toEqual([])
    expect(scan('ctx.slots.register(options, Panel)')).toEqual([])
    expect(scan('ctx.slots.register()')).toEqual([])
  })
})
