# DeepSeek Harness Desktop

[English](README.md) | 中文

此应用在 Electron 中托管构建后的 Harness Web profile。它使用应用自有的 desktop profile 启动真实的本地 `dsh` process，等待经过认证的 loopback URL，然后在沙箱化 renderer 中加载该 origin。Electron 会在 Client plugin assembly 前标识 desktop surface，因此窗口会构建自己的 frame，而不是浏览器的三列 shell。窗口使用来自 DeepSeek-LLM 官方 logo asset 的 DeepSeek 鲸鱼标志。

该 frame 由四列组成：会话侧栏、Team Alpha workspace、conversation 与 details column。当前会话为空白时，Team column 会收起并由 conversation 占据空间，因此在第一份工作落地前，屏幕上只有 workspace picker 与 composer。Workspace 是主 surface，conversation 位于其旁，因此桌面无需离开 Team surface 即可触达会话历史、设置与工具详情。由于侧栏已挂载，全新的桌面 profile 会先显示 settings onboarding —— 测试须知与 API key 提示 —— 这正是应用获得可用模型的方式。

workspace 展示的是 Team 正在工作，而不只是它当前的形状。任务板下方有一条时间线，按最新在前列出 Team 记录过的事情 —— teammate 变为 `ready`、task 被认领或完成、message 入队随后送达。它读取 Lead 自身的会话日志，而不是另建一份记录，因此不会与 Team 实际发生的事情相矛盾；它也是已完成的 task 与已送达的 message 唯一得以保留的地方：两者在成功的那一刻就离开了看板。

展开一张 roster card，会看到该成员正在做什么，以及它花掉了什么。card 会 tail 它最近记录的工作 —— 它说的话、它运行的 tool，以及这些 tool 返回了什么，按需截断并在截断处标记 —— 并说明它的开销：轮次、模型与工具的墙钟时间，以及输入、输出与缓存命中 token，读取自该成员自身的 session projection。只有当 provider 确实提供了缓存命中时才显示该项，因为此处的 0 与「没有缓存」是不同的事实。开销在成员处于 attached 状态时报告，因此回合进行中的 teammate 会显示，而在两轮之间休息的不会。

已声明的 write scope 会被真正执行，而不只是被报告。进行中任务所声明的 scope，在该任务运行期间属于它的 owner；其他成员通过文件系统 tool 写入该范围会失败，并给出路径、scope、任务与持有它的成员 —— 这足以让模型给该成员发消息、接管该任务，或转向别处工作。重新指派任务会让 lease 随之转移，完成任务则释放该 scope。Bash 与任何直接的文件系统调用仍会绕过它，这与既有版本保护的覆盖范围相同。

workspace 通过一个 stream 跟随 Team，而不是轮询。每个 frame 承载完整 view 并替换看板，因此变化与它所产生的 view 一同到达；传输层负责跨连接代次重新打开，并在关闭时取消，因此关窗会结束 Harness 侧的等待，而不是留下一个注册项直到超时。teammate 记录工作时会释放同一个信号，这正是 tail 保持最新的原因。

一层 ambient 渐变是窗口的底色，而非任何单列的装饰。侧栏、conversation 与 details column 声明自身透明并共用同一层阅读 scrim，因此整个 surface 呈现为一整块玻璃。Team 调色板跟随当前主题，workspace toolbar 在 ambient 暂停按钮旁提供外观切换；host 同时通过 `nativeTheme.themeSource` 请求暗色 renderer，macOS 与 Windows 会遵循，Linux 不会。

在仓库根目录运行：

```bash
pnpm install
pnpm desktop
```

该应用还会传入自己的 patch layer `assets/profile.patch.yml`。`dsh-base` 以休眠方式挂载 pi-ai 多 provider adapter 及其旁的 credential store，但没有任何 bundle 挂载 authorization seam，因此 pi-ai 的 provider login 从不注册；该 patch 负责挂载它。实际运行哪些 provider 仍属用户设置 —— Models 页面会把它们写入 `$DSH_HOME/settings.yaml`，凭据则写入受管 credential store，而非进程环境。

设置 `DSH_DESKTOP_WORKSPACE` 可让 Harness 针对 shell 初始 working directory 以外的目录启动。Desktop data 隔离在 Electron 的 per-user application-data directory 下。Renderer 不启用 Node integration，不提供 preload bridge，不授予 permission，且无法离开本地 Harness origin；外部 HTTP link 会在操作系统浏览器中打开。

Desktop host 使用 `PATH` 中的 `node` executable 启动 Harness；必要时可通过 `DSH_DESKTOP_NODE` 指定明确的 Node executable。仓库与 desktop entry 构建完成后，`pnpm --filter @deepseek-ai/dsh-desktop run test:smoke` 会验证 Electron 能显示 splash window、清除首次运行的 onboarding gate、挂载 conversation column 与其 composer seat、确认会话空白时 Team column 处于收起状态并将其展开、进入实时 Team roster，并执行参考交互中的 card expansion 与 sibling movement。Hover 断言会重试：展开由指针在一个自身正在动画的盒子上的 enter/leave 驱动，约每二十五次 hover 会有一次中途丢失，因此运行会重新 hover 而非直接失败，同时仍会让始终无法展开的 card 判定失败。
