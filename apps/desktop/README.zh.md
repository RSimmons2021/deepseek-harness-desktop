# DeepSeek Harness Desktop

[English](README.md) | 中文

此应用在 Electron 中托管构建后的 Harness Web profile。它使用应用自有的 desktop profile 启动真实的本地 `dsh` process，等待经过认证的 loopback URL，然后在沙箱化 renderer 中加载该 origin。Electron 会在 Client plugin assembly 前标识 desktop surface，因此窗口会构建自己的 frame，而不是浏览器的三列 shell。窗口使用来自 DeepSeek-LLM 官方 logo asset 的 DeepSeek 鲸鱼标志。

该 frame 由四列组成：会话侧栏、Team Alpha workspace、conversation 与 details column。当前会话为空白时，Team column 会收起并由 conversation 占据空间，因此在第一份工作落地前，屏幕上只有 workspace picker 与 composer。Workspace 是主 surface，conversation 位于其旁，因此桌面无需离开 Team surface 即可触达会话历史、设置与工具详情。由于侧栏已挂载，全新的桌面 profile 会先显示 settings onboarding —— 测试须知与 API key 提示 —— 这正是应用获得可用模型的方式。

一层 ambient 渐变是窗口的底色，而非任何单列的装饰。侧栏、conversation 与 details column 声明自身透明并共用同一层阅读 scrim，因此整个 surface 呈现为一整块玻璃。Team 调色板跟随当前主题，workspace toolbar 在 ambient 暂停按钮旁提供外观切换；host 同时通过 `nativeTheme.themeSource` 请求暗色 renderer，macOS 与 Windows 会遵循，Linux 不会。

在仓库根目录运行：

```bash
pnpm install
pnpm desktop
```

该应用还会传入自己的 patch layer `profile.patch.yml`。`dsh-base` 以休眠方式挂载 pi-ai 多 provider adapter 及其旁的 credential store，但没有任何 bundle 挂载 authorization seam，因此 pi-ai 的 provider login 从不注册；该 patch 负责挂载它。实际运行哪些 provider 仍属用户设置 —— Models 页面会把它们写入 `$DSH_HOME/settings.yaml`，凭据则写入受管 credential store，而非进程环境。

设置 `DSH_DESKTOP_WORKSPACE` 可让 Harness 针对 shell 初始 working directory 以外的目录启动。Desktop data 隔离在 Electron 的 per-user application-data directory 下。Renderer 不启用 Node integration，不提供 preload bridge，不授予 permission，且无法离开本地 Harness origin；外部 HTTP link 会在操作系统浏览器中打开。

Desktop host 使用 `PATH` 中的 `node` executable 启动 Harness；必要时可通过 `DSH_DESKTOP_NODE` 指定明确的 Node executable。仓库与 desktop entry 构建完成后，`pnpm --filter @deepseek-ai/dsh-desktop run test:smoke` 会验证 Electron 能显示 splash window、清除首次运行的 onboarding gate、挂载 conversation column 与其 composer seat、确认会话空白时 Team column 处于收起状态并将其展开、进入实时 Team roster，并执行参考交互中的 card expansion 与 sibling movement。Hover 断言会重试：展开由指针在一个自身正在动画的盒子上的 enter/leave 驱动，约每二十五次 hover 会有一次中途丢失，因此运行会重新 hover 而非直接失败，同时仍会让始终无法展开的 card 判定失败。
