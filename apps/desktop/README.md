# DeepSeek Harness Desktop

English | [中文](README.zh.md)

This application hosts the built Harness Web profile inside Electron. It starts the real local `dsh` process with an app-owned desktop profile, waits for the authenticated loopback URL, and then loads that origin in a sandboxed renderer. Electron identifies the desktop surface before Client plugin assembly, so the window builds its own frame instead of the browser's three-column shell. The window uses the DeepSeek whale mark from the official DeepSeek-LLM logo asset.

The frame is four columns: the session rail, the Team Alpha workspace, the conversation, and the details column. The workspace is the hero and the conversation sits beside it, so the desktop reaches session history, settings, and tool details without leaving the Team surface. Because the rail is mounted, a fresh desktop profile starts behind the settings onboarding — the testing notice and the API-key prompt — which is how the application reaches a working model.

One ambient gradient is the window's ground rather than any column's decoration. The rail, conversation, and details columns declare themselves transparent and carry a shared reading scrim, so the surface reads as one piece of glass. The Team palette follows the active theme, and the workspace toolbar carries an appearance toggle beside the ambient pause; the host also asks for a dark renderer through `nativeTheme.themeSource`, which macOS and Windows honour and Linux does not.

From the repository root:

```bash
pnpm install
pnpm desktop
```

Set `DSH_DESKTOP_WORKSPACE` to launch the Harness against a directory other than the shell's initial working directory. Desktop data is isolated under Electron's per-user application-data directory. The renderer has no Node integration, no preload bridge, no permission grants, and cannot navigate away from the local Harness origin; external HTTP links open in the operating system browser.

The desktop host starts the Harness with the `node` executable from `PATH`; set `DSH_DESKTOP_NODE` to an explicit Node executable when required. After the repository and desktop entry are built, `pnpm --filter @deepseek-ai/dsh-desktop run test:smoke` verifies that Electron displays its splash window, clears the first-run onboarding gates, mounts the conversation column and its composer seat, reaches the live Team roster, and performs the card expansion and sibling movement from the reference interaction. The hover assertion retries: expansion is driven by pointer enter/leave on a box that is itself animating, and about one hover in twenty-five is lost part way through, so the run re-hovers rather than failing while still failing a card that never expands.
