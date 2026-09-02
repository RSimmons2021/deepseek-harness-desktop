# DeepSeek Harness Desktop

English | [中文](README.zh.md)

A fork of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) that adds a desktop application and a shared workspace for a team of agents.

Upstream is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com), built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512). Everything here is a plugin on top of that: this fork changes nothing under `packages/core`.

Upstream documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## What this fork adds

**A desktop application.** [`apps/desktop`](apps/desktop/README.md) hosts the built Web profile inside Electron: it starts a real local `dsh` process against an app-owned profile, waits for the authenticated loopback URL, and loads that origin in a sandboxed renderer. The window builds its own four-column frame — session rail, Team workspace, conversation, and details — instead of the browser's three-column shell.

**A Team workspace.** [`agent-team`](packages/experimental/agent-team/README.md) holds the Team itself: a roster of members, a shared task board read as a dependency graph, and a timeline of what the Team recorded, projected from the Lead's own session log rather than kept as a second record that could disagree with it. [`client-ui-agent-team`](packages/experimental/client-ui-agent-team/README.md) is the surface — cards that show what each member is doing and what it has spent, tasks whose dependencies are chosen from the board by subject, and a record that marks what arrived since you last looked. It follows the running Team over one stream rather than a poll. [`tool-agent-team`](packages/experimental/tool-agent-team/README.md) gives the model the same board the reader sees.

**Enforced write scopes.** [`agent-team-write-lease`](packages/experimental/agent-team-write-lease/README.md) turns the scopes an in-progress task claims into a lease held by that task's owner. Another member's filesystem-tool write inside one fails with the path, the scope, the task, and the member holding it — enough to message that member, take the task over, or work elsewhere.

**Provider sign-in from the application.** [`authorization`](packages/credentials/authorization/README.md) mounts the seam pi-ai's provider logins register on, which no shipped bundle mounts, so [`ui-settings-models`](packages/client/ui-settings-models/README.md) can sign into a provider from the Models page. Credentials go to the managed credential store rather than the process environment.

## Run

### Run from source

Install `Node.js` and `pnpm`, then:

```sh
git clone https://github.com/RSimmons2021/deepseek-harness-desktop.git
cd deepseek-harness-desktop
pnpm install
pnpm desktop
```

`pnpm desktop` builds the repository, builds the Electron entry, and starts the desktop application. A fresh profile opens behind the testing notice and the API-key prompt, which is how it reaches a working model; a provider can also be signed into later from Settings → Models.

### The Web UI

`pnpm dsh web` serves the same Harness in a browser at `http://127.0.0.1:3080`, using the artifacts `pnpm run build` produced rather than rebuilding. The Team workspace is a profile layer, so add it to the profile that command uses:

```sh
pnpm dsh plugin --profile web add ./packages/experimental/agent-team-profile
pnpm dsh plugin --profile web add ./packages/experimental/agent-team-web-profile
```

Upstream also publishes the Web UI without a checkout, as `npx @deepseek-ai/dsh web`. That build carries no Team workspace. See the [Web UI guide](docs/user/guide/index.md).

## Developer preview

Upstream is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES**, and this fork tracks it.

Review the [safety notice](SAFETY.md) before running the project.

## Community and support

- Raise anything about this fork on its own [issues](https://github.com/RSimmons2021/deepseek-harness-desktop/issues).
- Upstream feedback and bug reports go to [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
