import { strict as assert } from 'node:assert'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(desktopRoot, '../..')
const userData = await mkdtemp(join(tmpdir(), 'dsh-desktop-smoke-'))
const iconPath = join(desktopRoot, 'assets/icon.png')

assert.equal(existsSync(iconPath), true, `desktop icon is missing at ${iconPath}`)

const application = await electron.launch({
  executablePath: electronPath,
  args: [`--user-data-dir=${userData}`, desktopRoot],
  env: {
    ...process.env,
    DSH_DESKTOP_NODE: process.execPath,
    DSH_DESKTOP_WORKSPACE: repositoryRoot,
  },
})

try {
  const page = await application.firstWindow({ timeout: 15_000 })
  page.on('console', message => { console.log(`desktop console [${message.type()}]: ${message.text()}`) })
  page.on('pageerror', error => { console.error(`desktop page error: ${error.stack ?? error.message}`) })
  assert.equal(await page.title(), 'Starting workspace')
  await page.waitForURL(url => url.protocol === 'http:', { timeout: 60_000 })
  try {
    await page.locator('[data-team-standalone="true"] [role="main"]').waitFor({ timeout: 60_000 })
  } catch (error) {
    const artifactDirectory = join(repositoryRoot, '.artifacts')
    mkdirSync(artifactDirectory, { recursive: true })
    await page.screenshot({ path: join(artifactDirectory, 'desktop-startup-failure.png'), fullPage: true })
    console.error(`desktop body: ${(await page.locator('body').innerText()).slice(0, 4000)}`)
    throw error
  }
  assert.match(await page.evaluate(() => navigator.userAgent), /DeepSeekHarnessDesktop/u)
  await page.locator('[data-shell-overlay]').waitFor({ timeout: 30_000 })
  // The conversation column mounts in its hero state until a workspace is
  // chosen, so assert the surface and its composer seat rather than an input.
  await page.locator('[data-conversation-scroll]').waitFor({ timeout: 60_000 })
  const composerSeat = page.locator('[data-composer-seat]')
  await composerSeat.waitFor({ timeout: 60_000 })
  const conversationWidth = (await page.locator('[data-slot="conversation"] > *').first().boundingBox())?.width ?? 0
  assert.ok(conversationWidth > 200, `conversation column collapsed to ${String(conversationWidth)}px`)
  // Scope to the Team roster: the conversation column beside it also renders
  // list items, so a page-wide listitem locator no longer names a roster card.
  const roster = page.locator('[data-team-action] [role="list"]').first()
  const member = page.locator('[data-team-member-card]').first()
  const secondCard = roster.locator('[role="listitem"]').nth(1)
  await member.waitFor({ timeout: 30_000 })
  const beforeMember = await member.boundingBox()
  const beforeSecond = await secondCard.boundingBox()
  await member.hover()
  await page.waitForTimeout(750)
  const expandedMember = await member.boundingBox()
  const shiftedSecond = await secondCard.boundingBox()
  assert.ok(beforeMember !== null && expandedMember !== null && expandedMember.width > beforeMember.width + 20)
  assert.ok(beforeSecond !== null && shiftedSecond !== null && shiftedSecond.x > beforeSecond.x + 10)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(300)
  await page.evaluate(() => { window.scrollTo(0, 0) })
  const artifactDirectory = join(repositoryRoot, '.artifacts')
  mkdirSync(artifactDirectory, { recursive: true })
  await page.screenshot({ path: join(artifactDirectory, 'desktop-startup.png'), fullPage: true })
  console.log(`desktop smoke: loaded ${new URL(page.url()).origin}`)
} finally {
  await application.close()
  rmSync(userData, { recursive: true, force: true })
}
