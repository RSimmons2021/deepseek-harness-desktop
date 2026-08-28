# DeepSeek Harness Desktop

[English](README.md) | 中文

此应用在 Electron 中托管构建后的 Harness Web profile。它使用应用自有的 desktop profile 启动真实的本地 `dsh` process，等待经过认证的 loopback URL，然后在沙箱化 renderer 中加载该 origin。Electron 会在 Client plugin assembly 前标识 desktop surface，因此窗口会直接进入全屏 Team Alpha workspace，而不会挂载浏览器的 sidebar、conversation hero 或 onboarding notice。窗口使用来自 DeepSeek-LLM 官方 logo asset 的 DeepSeek 鲸鱼标志。

在仓库根目录运行：

```bash
pnpm install
pnpm desktop
```

设置 `DSH_DESKTOP_WORKSPACE` 可让 Harness 针对 shell 初始 working directory 以外的目录启动。Desktop data 隔离在 Electron 的 per-user application-data directory 下。Renderer 不启用 Node integration，不提供 preload bridge，不授予 permission，且无法离开本地 Harness origin；外部 HTTP link 会在操作系统浏览器中打开。

Desktop host 使用 `PATH` 中的 `node` executable 启动 Harness；必要时可通过 `DSH_DESKTOP_NODE` 指定明确的 Node executable。仓库与 desktop entry 构建完成后，`pnpm --filter @deepseek-ai/dsh-desktop run test:smoke` 会验证 Electron 能显示 splash window、进入实时 Team roster，并执行参考交互中的 spring card expansion 与 sibling movement。
