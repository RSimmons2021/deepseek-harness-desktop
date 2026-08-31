import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { isArchivedAgentNotePath, uniqueRepoFiles } from './repo-files.ts'

const root = mkdtempSync(join(tmpdir(), 'dsh-repo-files-'))
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

function write(path: string, text = 'body\n'): void {
  const absolute = resolve(root, path)
  mkdirSync(resolve(absolute, '..'), { recursive: true })
  writeFileSync(absolute, text)
}

write('notes/one/expected.md')
write('notes/one/two/expected.md')
write('notes/one/other.md')
// A DIRECTORY carrying the literal tail's name: the tree shape that makes
// Node's own `**` walk descend into it and throw ENOTDIR.
mkdirSync(resolve(root, 'notes/expected.md'), { recursive: true })
write('notes/expected.md/inner.md')
write('top.md')

describe('uniqueRepoFiles', () => {
  it('expands a literal filename under a recursive prefix without walking into it', () => {
    const found = uniqueRepoFiles(root, ['notes/**/expected.md'])
      .map(file => relative(root, file.abs).split('\\').join('/'))
    // The directory of the same name contributes nothing; both real files do.
    expect([...found].sort()).toEqual(['notes/one/expected.md', 'notes/one/two/expected.md'])
  })

  it('keeps wildcard tails, exact paths, and the exclusion predicate', () => {
    const found = uniqueRepoFiles(root, ['notes/one/*.md', 'top.md', 'notes/missing.md'])
      .map(file => relative(root, file.abs).split('\\').join('/'))
    expect([...found].sort()).toEqual(['notes/one/expected.md', 'notes/one/other.md', 'top.md'])

    const excluded = uniqueRepoFiles(root, ['notes/one/*.md'], path => path.endsWith('other.md'))
    expect(excluded).toHaveLength(1)
  })

  it('reports one entry for a file reached through a symlink', () => {
    symlinkSync(resolve(root, 'top.md'), resolve(root, 'alias.md'))
    expect(uniqueRepoFiles(root, ['top.md', 'alias.md'])).toHaveLength(1)
  })

  it('names archived Agent Notes on either separator', () => {
    expect(isArchivedAgentNotePath('.agents/notes/archived/old.md')).toBe(true)
    expect(isArchivedAgentNotePath('.agents\\notes\\archived\\old.md')).toBe(true)
    expect(isArchivedAgentNotePath('.agents/notes/implemented/new.md')).toBe(false)
  })
})
