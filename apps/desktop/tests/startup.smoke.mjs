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
let applicationClosed = false

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

  // Mounting the sidebar brings the settings onboarding with it, and a fresh
  // user-data directory always starts behind the testing notice and the API-key
  // prompt. Clear both so the assertions below reach the workspace; a launch
  // that has already acknowledged them shows neither.
  for (const label of [/^Continue$/u, /^Configure later$/u]) {
    const gate = page.getByRole('button', { name: label })
    // Wait for the gate rather than sampling for it: the onboarding mounts a
    // beat after the shell, so a bare count() races it and leaves the notice
    // covering everything the assertions below reach for.
    await gate.first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    if (await gate.count() > 0) {
      await gate.first().click()
      await page.waitForTimeout(500)
    }
  }
  await page.locator('[data-shell-overlay]').waitFor({ timeout: 30_000 })
  // The conversation column mounts in its hero state until a workspace is
  // chosen, so assert the surface and its composer seat rather than an input.
  await page.locator('[data-conversation-scroll]').waitFor({ timeout: 60_000 })
  const composerSeat = page.locator('[data-composer-seat]')
  await composerSeat.waitFor({ timeout: 60_000 })
  const conversationWidth = (await page.locator('[data-slot="conversation"] > *').first().boundingBox())?.width ?? 0
  assert.ok(conversationWidth > 200, `conversation column collapsed to ${String(conversationWidth)}px`)
  // A blank Session hands the room to the conversation, so the Team column is
  // mounted at zero width until the first work lands. Assert that, then reveal
  // it to exercise the roster: reaching a non-blank Session for real needs a
  // model, which this keyless run has no way to call.
  const frame = page.locator('[data-session-blank]')
  await frame.waitFor({ timeout: 30_000 })
  const collapsed = await page.locator('[data-slot="desktop.root"] > *').first().boundingBox()
  assert.ok(
    collapsed === null || collapsed.width < 1,
    `Team column should be collapsed while the Session is blank, got ${JSON.stringify(collapsed)}`,
  )
  await page.evaluate(() => { document.querySelector('[data-session-blank]')?.removeAttribute('data-session-blank') })
  await page.waitForTimeout(600)

  // Scope to the Team roster: the conversation column beside it also renders
  // list items, so a page-wide listitem locator no longer names a roster card.
  const roster = page.locator('[data-team-action] [role="list"]').first()
  const member = page.locator('[data-team-member-card]').first()
  const secondCard = roster.locator('[role="listitem"]').nth(1)
  await member.waitFor({ timeout: 30_000 })

  // Pointer exit belongs to the stable roster boundary, so the card can widen
  // and move its siblings without cancelling its own hover halfway through.
  await page.mouse.move(0, 0)
  await page.waitForTimeout(700)
  const restMember = await member.boundingBox()
  const restSecond = await secondCard.boundingBox()
  await member.hover()
  await page.waitForTimeout(750)
  assert.equal(await member.getAttribute('data-expanded'), 'true', 'roster card lost hover while expanding')
  const openMember = await member.boundingBox()
  const openSecond = await secondCard.boundingBox()
  assert.ok(
    restMember !== null && openMember !== null && openMember.width > restMember.width + 20,
    `hovered card did not widen: ${JSON.stringify({ before: restMember?.width, after: openMember?.width })}`,
  )
  assert.ok(
    restSecond !== null && openSecond !== null && openSecond.x > restSecond.x + 10,
    `sibling did not shift: ${JSON.stringify({ before: restSecond?.x, after: openSecond?.x })}`,
  )
  await page.mouse.move(0, 0)
  await page.waitForTimeout(300)
  await page.evaluate(() => { window.scrollTo(0, 0) })
  const artifactDirectory = join(repositoryRoot, '.artifacts')
  mkdirSync(artifactDirectory, { recursive: true })
  await page.screenshot({ path: join(artifactDirectory, 'desktop-startup.png'), fullPage: true })
  const harnessOrigin = new URL(page.url()).origin
  console.log(`desktop smoke: loaded ${harnessOrigin}`)

  await application.close()
  applicationClosed = true
  const shutdownDeadline = Date.now() + 10_000
  let harnessStopped = false
  while (!harnessStopped && Date.now() < shutdownDeadline) {
    try {
      await fetch(harnessOrigin, { signal: AbortSignal.timeout(500) })
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch {
      harnessStopped = true
    }
  }
  assert.equal(harnessStopped, true, 'desktop Harness kept accepting connections after Electron closed')
} finally {
  if (!applicationClosed) await application.close()
  rmSync(userData, { recursive: true, force: true })
}
