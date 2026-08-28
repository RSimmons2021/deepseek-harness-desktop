# Agent Note: Agent Team workspace 的 Electron host

状态：已实现

[English](2026-08-28-electron-agent-team-workspace.md) | 中文

## 问题

Agent Teams 已有权威 Host service 与浏览器 projection，但紧凑的 conversation-header panel 无法表达所提供桌面设计中的共享 workspace 与协作者空间关系。桌面应用还需要启动并认证本地 Harness process，同时不能重复实现 Web client，也不能向浏览器内容授予 Node.js 访问权限。

## 决策

[`TeamAction`](../../../../packages/experimental/client-ui-agent-team/src/client/TeamAction.tsx) 在普通 Web build 中继续作为 conversation-header slot contribution，同时也提供 desktop root 使用的实时 Team surface。两种形式都由既有 `agentTeams/view`、`agentTeams/createTask` 与 `agentTeams/updateTask` Remote method 驱动。真实 member 占据玻璃质感 roster card；未使用容量显示为不可交互的开放席位。Mouse hover 与键盘 focus 会选择一个 card。Motion shared-layout projection 使用一个可中断 spring，让该 card 的 flex reflow 与所有 sibling 从各自测量位置开始动画。参考设计中的高饱和橘色与蓝色 ambient field 只通过缓慢、低振幅的 compositor transform 移动；reduced-motion 会冻结它们。Touch 不合成 hover，reduced-motion 也会移除 card 空间动画，状态变化会同步移除过期 Session 内容。

Electron 在任何页面加载前会向 renderer user agent 追加 `DeepSeekHarnessDesktop` 标记。Layout plugin 使用这个 assembly-time 标记注册最小化 [`DesktopFrame`](../../../../packages/client/ui-layout/src/client/DesktopFrame.tsx)，而不是浏览器 `AppFrame`。该 frame 保留 stock child-slot declaration，使普通 Client plugin 可以激活，但只渲染 `desktop.root` seat。Agent Teams Client 占据该 seat，选择现有 Session 或创建一个 Session，并立即挂载 Team Alpha workspace。浏览器 sidebar、conversation hero、settings onboarding 与 testing notice 均不会被渲染，而不是在首次绘制后再隐藏。

[`@deepseek-ai/dsh-desktop`](../../../../apps/desktop/README.zh.md) 是专用 Electron application，负责通过应用自有 desktop profile 运行构建后的 `dsh` entry。该 profile 组合 base、Web、Agent Teams Host 与 Agent Teams Web bundle，使 profile module fallback 拥有所有 plugin dependency。Harness loader 需要 internal module-loader seam，而 Electron embedded Node 不会公开它，因此 child 使用 system Node executable 运行。Child 绑定操作系统选择的 loopback port，main process 等待 authenticated readiness URL 后再加载。Desktop Harness state 位于 Electron 的 per-user application-data directory 下；`DSH_DESKTOP_WORKSPACE` 可以选择 working directory，`DSH_DESKTOP_NODE` 可以选择 Node executable。

BrowserWindow 启用 context isolation 与 Chromium sandbox、禁用 Node integration、不提供 preload bridge，并且除了 sanitized clipboard write 以外不授予浏览器 permission。Navigation 保持在 authenticated Harness origin。新窗口会被拒绝，外部 HTTP link 在操作系统浏览器中打开。关闭应用会终止受监管的 Harness process。Window icon 使用从 DeepSeek 官方 DeepSeek-LLM logo asset 中提取的鲸鱼标志。

Root `pnpm desktop` command 构建 Harness library 与 Web frontend、构建 Electron entry，然后启动 desktop host。Electron 不进入 root workspace library build，因为它是 product host，而不是 plugin package。

## 边界

Desktop application 是源码 checkout 开发 host，不是已签名或可分发 installer。它不包含 updater、native menu command、preload API、Team state 或第二套 frontend。启动依赖已构建的 Harness artifact 与兼容的 system Node executable，既有 Web profile 继续负责 authentication、RPC、locale、accessibility 与 product behavior。

## 考虑过的替代方案

**构建独立 Electron renderer。** 拒绝，因为这会重复 plugin composition、Remote transport、Session navigation、locale dictionary 与后续每个 Web feature。

**在 Web renderer 中启用 Node integration。** 拒绝，因为当前 Agent Team workspace 不需要 desktop privilege，而暴露 Node 会把 Web content bug 转化为 local-code execution。

**直接动画 card width。** 拒绝，因为 width tween 会在每帧触发 layout，并且在 hover 快速重定向时无法保持 sibling 连续性。Shared-layout projection 只测量一次新的 flex layout，然后动画 compositor transform。

## 测试

Agent Team component suite 覆盖既有 Remote 与 task behavior，并覆盖 mouse、touch、keyboard、expansion 与 collapse state。Client compilation 与 assembled Web end-to-end profile 覆盖动态 browser bundle。Electron package 独立编译并 bundle，而完整 repository build 产出其监管的 CLI 与 Web artifact。Desktop smoke test 使用隔离的 user data 启动真实 Electron process，断言 splash window，等待 authenticated HTTP navigation 与实时 Team member card，然后测量 hover 前后的 card box。如果选中的 card 没有变宽或 sibling 没有移动，测试就会失败；测试还会写出真实 Electron screenshot，用于与提供的参考设计进行视觉比较。

## 后果

Web browser 与 Electron desktop host 共享同一个 Agent Teams implementation 和同一个权威 state path。稳定 layout package 只暴露通用 `desktop.root` seat，且从不 import 实验性 feature；实验性 Agent Teams package 提供该 seat 的 occupant。Desktop process 增加 Electron runtime download 与本地 supervisor lifecycle，但不会让稳定 package 增加实验性 runtime dependency，也不会让 renderer 获得 native authority。
