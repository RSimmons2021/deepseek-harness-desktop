import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, nativeTheme, shell } from 'electron'

const DESKTOP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_ROOT = resolve(DESKTOP_ROOT, '../..')
const CLI_ENTRY = join(REPOSITORY_ROOT, 'apps/cli/lib/bin.js')
const DESKTOP_ICON = join(DESKTOP_ROOT, 'assets/icon.png')
const DESKTOP_PROFILE = 'desktop'
const DESKTOP_PROFILE_BUNDLES = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-experimental-agent-team-profile',
  '@deepseek-ai/dsh-experimental-agent-team-web-profile',
] as const
const TEAM_PROFILE_MANIFESTS = [
  join(REPOSITORY_ROOT, 'packages/experimental/agent-team-profile/package.json'),
  join(REPOSITORY_ROOT, 'packages/experimental/agent-team-web-profile/package.json'),
] as const
const READY_PATTERN = /dsh web: (http:\/\/[^\s(]+)/u
const STARTUP_TIMEOUT_MS = 60_000

let harnessProcess: ChildProcess | undefined
let mainWindow: BrowserWindow | undefined
let allowedOrigin: string | undefined
let quitting = false

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function bootPage(title: string, message: string, detail = ''): string {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; overflow: hidden; background: #071020; color: #f7f8fb; }
      body::before, body::after { content: ""; position: fixed; width: 58vw; height: 70vh; border-radius: 50%; filter: blur(90px); opacity: .72; }
      body::before { top: -30vh; left: 17vw; background: #d77917; }
      body::after { right: -18vw; bottom: -34vh; background: #185bc4; }
      main { position: relative; z-index: 1; width: min(560px, calc(100vw - 48px)); padding: 36px; border: 1px solid rgba(255,255,255,.13); border-radius: 18px; background: rgba(8,20,46,.58); box-shadow: 0 30px 90px rgba(0,0,0,.3); backdrop-filter: blur(24px); }
      small { display: block; margin-bottom: 10px; color: rgba(255,255,255,.5); font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
      h1 { margin: 0 0 8px; font-size: clamp(25px, 4vw, 39px); font-weight: 440; letter-spacing: -.04em; }
      p { margin: 0; color: rgba(255,255,255,.62); font-size: 14px; line-height: 1.6; }
      code { display: block; max-height: 150px; margin-top: 18px; overflow: auto; color: #ffb154; font-size: 11px; white-space: pre-wrap; }
      .pulse { width: 7px; height: 7px; margin-top: 24px; border-radius: 50%; background: #ff9f1a; box-shadow: 0 0 22px #ff9f1a; animation: pulse 1.2s ease-in-out infinite alternate; }
      @keyframes pulse { to { opacity: .35; transform: scale(.72); } }
      @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
    </style>
  </head>
  <body>
    <main>
      <small>DeepSeek Harness Desktop</small>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${detail === '' ? '<div class="pulse" aria-hidden="true"></div>' : `<code>${escapeHtml(detail)}</code>`}
    </main>
  </body>
</html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function isExternalUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function isAllowedNavigation(value: string): boolean {
  if (value.startsWith('data:text/html')) return true
  if (allowedOrigin === undefined) return false
  try {
    return new URL(value).origin === allowedOrigin
  } catch {
    return false
  }
}

async function showFailure(title: string, error: unknown): Promise<void> {
  if (mainWindow?.isDestroyed() !== false) return
  const reason = error instanceof Error ? error.message : String(error)
  await mainWindow.loadURL(bootPage(title, 'The local Harness service could not be started.', reason))
}

function workspaceDirectory(): string {
  return process.env.DSH_DESKTOP_WORKSPACE ?? process.env.INIT_CWD ?? process.cwd()
}

function prepareDesktopProfile(desktopData: string): void {
  const profileDirectory = join(desktopData, 'profiles', DESKTOP_PROFILE)
  mkdirSync(profileDirectory, { recursive: true })
  writeFileSync(join(profileDirectory, 'package.json'), `${JSON.stringify({
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: {},
    dsh: {
      profile: {
        bundles: DESKTOP_PROFILE_BUNDLES,
        patchReload: 'startup',
      },
    },
  }, undefined, 2)}\n`)
}

function startHarness(): Promise<string> {
  for (const path of [CLI_ENTRY, ...TEAM_PROFILE_MANIFESTS]) {
    if (!existsSync(path)) {
      throw new Error(`Missing built desktop dependency: ${path}. Run pnpm desktop from the repository root.`)
    }
  }

  const desktopData = join(app.getPath('userData'), 'harness')
  prepareDesktopProfile(desktopData)
  const child = spawn(process.env.DSH_DESKTOP_NODE ?? 'node', [
    CLI_ENTRY,
    '--profile', DESKTOP_PROFILE,
    '--no-open',
    '--port', '0',
  ], {
    cwd: workspaceDirectory(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DSH_HOME: desktopData,
      DSH_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  harnessProcess = child

  return new Promise((resolveReady, rejectReady) => {
    let ready = false
    let buffered = ''
    const timeout = setTimeout(() => {
      rejectReady(new Error(`Harness did not report a ready URL within ${String(STARTUP_TIMEOUT_MS / 1000)} seconds.`))
      child.kill()
    }, STARTUP_TIMEOUT_MS)

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buffered = `${buffered}${chunk}`
      const lines = buffered.split(/\r?\n/u)
      buffered = lines.pop() ?? ''
      for (const line of lines) {
        const match = READY_PATTERN.exec(line)
        if (match?.[1] !== undefined && !ready) {
          ready = true
          clearTimeout(timeout)
          resolveReady(match[1])
        } else if (line !== '') {
          console.log(line)
        }
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { console.error(chunk.trimEnd()) })
    child.once('error', (error) => {
      clearTimeout(timeout)
      if (!ready) rejectReady(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      harnessProcess = undefined
      const reason = `Harness exited with ${code === null ? `signal ${String(signal)}` : `code ${String(code)}`}.`
      if (!ready) rejectReady(new Error(reason))
      else if (!quitting) void showFailure('Harness stopped', new Error(reason))
    })
  })
}

function createWindow(): BrowserWindow {
  // The window paints a dark ground and the boot page is dark, so the renderer
  // should resolve `prefers-color-scheme` the same way: the shipped theme
  // preference is `system`, and a light host puts a light conversation column
  // beside the always-dark Team workspace. This sets `shouldUseDarkColors`, and
  // macOS and Windows carry it into the renderer; on Linux it does not reach
  // `prefers-color-scheme`, so the surface there still follows the desktop
  // session until the theme preference is set explicitly in app settings.
  nativeTheme.themeSource = 'dark'
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#071020',
    icon: DESKTOP_ICON,
    autoHideMenuBar: true,
    title: 'DeepSeek Harness Desktop',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.webContents.setUserAgent(`${window.webContents.getUserAgent()} DeepSeekHarnessDesktop`)
  window.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write')
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigation(url)) return
    event.preventDefault()
    if (isExternalUrl(url)) void shell.openExternal(url)
  })
  window.on('closed', () => { mainWindow = undefined })
  return window
}

async function boot(): Promise<void> {
  mainWindow = createWindow()
  await mainWindow.loadURL(bootPage('Starting workspace', 'Launching the local Harness service and Agent Teams profile.'))
  mainWindow.show()
  try {
    const authenticatedUrl = await startHarness()
    allowedOrigin = new URL(authenticatedUrl).origin
    if (!mainWindow.isDestroyed()) await mainWindow.loadURL(authenticatedUrl)
  } catch (error) {
    await showFailure('Unable to start', error)
  }
}

app.on('before-quit', () => {
  quitting = true
  harnessProcess?.kill()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    return
  }
  harnessProcess?.kill()
  harnessProcess = undefined
  allowedOrigin = undefined
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void boot()
})

void app.whenReady()
  .then(boot)
  .catch((error: unknown) => {
    console.error('Desktop startup failed:', error)
    app.quit()
  })
