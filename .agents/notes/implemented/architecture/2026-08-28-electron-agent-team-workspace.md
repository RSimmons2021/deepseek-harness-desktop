# Agent Note: Electron host for the Agent Team workspace

Status: implemented

English | [中文](2026-08-28-electron-agent-team-workspace.zh.md)

## Problem

Agent Teams already has an authoritative Host service and browser projection, but the compact conversation-header panel does not convey the shared workspace or spatial relationship between collaborators in the supplied desktop design. A desktop application also needs to start and authenticate the local Harness process without duplicating the Web client or granting browser content access to Node.js.

## Decision

[`TeamAction`](../../../../packages/experimental/client-ui-agent-team/src/client/TeamAction.tsx) remains a conversation-header slot contribution in ordinary Web builds and also supplies the live Team surface used by the desktop root. Both forms are backed by the existing `agentTeams/view`, `agentTeams/createTask`, and `agentTeams/updateTask` Remote methods. Real members occupy glass roster cards; unused capacity appears as inert open seats. Mouse hover and keyboard focus select one card. The selected card animates its own `flex-grow` in CSS, so siblings give up their width through ordinary layout and the widening card rewraps its text as it goes. Grow, an eight-pixel lift, the surface tint, the border, and the drop shadow settle together over 600ms on the reference's overshooting curve; the top sheen and the assigned-task block the wider card uncovers follow over 400ms. The reference's saturated tangerine and blue ambient fields move only through slow, low-amplitude compositor transforms; reduced-motion freezes them. Touch does not synthesize hover, reduced-motion also removes spatial card animation, and state changes remove stale Session content synchronously.

Electron appends a `DeepSeekHarnessDesktop` marker to the renderer user agent before any page loads. The layout plugin uses that assembly-time marker to register a minimal [`DesktopFrame`](../../../../packages/client/ui-layout/src/client/DesktopFrame.tsx) instead of the browser `AppFrame`. The frame splits the window between that seat and the ordinary conversation column, and renders the frame-wide overlay layer beside them, so the desktop keeps the Team workspace as its hero and still talks to the agent. The Agent Teams Client occupies the content seat, selects an existing Session or creates one, and mounts the Team Alpha workspace immediately. The Team surface is a dialog in the browser and a column here, so under `standalone` its panel flows in its host column instead of covering the viewport. The sidebar and details slots stay declared so ordinary Client plugins still activate, but nothing renders them, and the browser sidebar, settings onboarding, and testing notice never paint.

[`@deepseek-ai/dsh-desktop`](../../../../apps/desktop/README.md) is a dedicated Electron application that supervises the built `dsh` entry with an app-owned desktop profile. The profile composes the base, Web, Agent Teams Host, and Agent Teams Web bundles so the profile module fallback owns every plugin dependency. The system Node executable runs the child because Electron's embedded Node does not expose the internal module-loader seam required by the Harness loader. The child binds an operating-system-selected loopback port, and the main process waits for the authenticated readiness URL before loading it. Desktop Harness state lives below Electron's per-user application-data directory; `DSH_DESKTOP_WORKSPACE` can select the working directory and `DSH_DESKTOP_NODE` can select the Node executable.

The BrowserWindow has context isolation and Chromium sandboxing enabled, Node integration disabled, no preload bridge, and no granted browser permissions except sanitized clipboard writes. Navigation stays on the authenticated Harness origin. New windows are denied, and external HTTP links open in the operating system browser. Closing the application terminates the supervised Harness process. The window icon uses the whale mark extracted from DeepSeek's official DeepSeek-LLM logo asset.

The root `pnpm desktop` command builds the Harness libraries and Web frontend, builds the Electron entry, and launches the desktop host. Electron remains outside the root workspace library build because it is a product host rather than a plugin package.

The Team palette is fixed rather than theme-derived, so beside themed chrome it reads as an always-dark surface. The desktop host asks for a dark renderer through `nativeTheme.themeSource`; macOS and Windows carry that into `prefers-color-scheme`, Linux does not, so on Linux the conversation column follows the desktop session until the theme preference is set in app settings.

## Boundaries

The desktop application is a source-checkout development host, not a signed or distributable installer. It contains no updater, native menu commands, preload API, Team state, or second frontend. Startup requires built Harness artifacts and a compatible system Node executable, and the existing Web profile continues to own authentication, RPC, locale, accessibility, and product behavior.

## Alternatives considered

**Build a separate Electron renderer.** Rejected because it would duplicate the plugin composition, Remote transport, Session navigation, locale dictionaries, and every later Web feature.

**Enable Node integration in the Web renderer.** Rejected because the current Agent Team workspace needs no desktop privilege and exposing Node would turn Web content bugs into local-code execution.

**Project the reflow through Motion's shared layout.** Rejected after the reference design was measured: it animates `flex-grow` itself, and transform projection scales a measured box instead of rewrapping the text inside it. The cost is accepted rather than absent — growing a flex item lays out every frame, and an interrupted hover retargets from the current computed value instead of a measured box.

## Testing

The Agent Team component suite covers existing Remote and task behavior plus mouse, touch, keyboard, expansion, and collapse state. Client compilation and the assembled Web end-to-end profile cover the dynamic browser bundle. The Electron package compiles and bundles independently, while the full repository build produces the CLI and Web artifacts it supervises. The desktop smoke test launches the real Electron process with isolated user data, asserts the splash window, waits for authenticated HTTP navigation and the live Team member card, then measures the pre-hover and post-hover card boxes. It fails unless the selected card widens and its sibling moves, and writes a real Electron screenshot for visual comparison with the supplied reference.

## Consequences

The Web browser and Electron desktop host share one Agent Teams implementation and one authoritative state path. The stable layout package exposes only a generic `desktop.root` seat and never imports the experimental feature; the experimental Agent Teams package supplies its occupant. The desktop process adds Electron's runtime download and local supervisor lifecycle, but no stable package gains an experimental runtime dependency and no renderer receives native authority.
