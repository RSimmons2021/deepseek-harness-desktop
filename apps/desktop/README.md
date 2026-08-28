# DeepSeek Harness Desktop

English | [中文](README.zh.md)

This application hosts the built Harness Web profile inside Electron. It starts the real local `dsh` process with an app-owned desktop profile, waits for the authenticated loopback URL, and then loads that origin in a sandboxed renderer. Electron identifies the desktop surface before Client plugin assembly, so the window enters the full-screen Team Alpha workspace directly instead of mounting the browser sidebar, conversation hero, or onboarding notice. The window uses the DeepSeek whale mark from the official DeepSeek-LLM logo asset.

From the repository root:

```bash
pnpm install
pnpm desktop
```

Set `DSH_DESKTOP_WORKSPACE` to launch the Harness against a directory other than the shell's initial working directory. Desktop data is isolated under Electron's per-user application-data directory. The renderer has no Node integration, no preload bridge, no permission grants, and cannot navigate away from the local Harness origin; external HTTP links open in the operating system browser.

The desktop host starts the Harness with the `node` executable from `PATH`; set `DSH_DESKTOP_NODE` to an explicit Node executable when required. After the repository and desktop entry are built, `pnpm --filter @deepseek-ai/dsh-desktop run test:smoke` verifies that Electron displays its splash window, reaches the live Team roster, and performs the spring card expansion and sibling movement from the reference interaction.
