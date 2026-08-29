---
description: "使用并排查实验性 Web Agent Teams workspace、共享任务板与 teammate 导航。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-agent-team

[English](README.md) | 中文

## 概述

本包向 Web 会话页头添加 Agent Teams action。打开后会呈现全屏协作 workspace，让用户检查当前 roster、管理共享任务板并导航到 teammate 会话。它通过生成的 `ctx.remote.agentTeams` contribution 读取权威 Team 状态，并让普通 child history 导航继续使用稳定的 addressed-subagent 路径。需要实验性源码 checkout Web profile 时选择本包；正式发布会排除它。这个浏览器 projection 不扩展稳定 API Proxy、不存储 Team 状态，也不注册面向模型的输入。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在稳定 Web bundle 与 Host-side Agent Teams profile 之后，通过 [`@deepseek-ai/dsh-experimental-agent-team-web-profile`](../agent-team-web-profile/README.zh.md) 安装本包。Web Client loader 挂载 `/client` export；root Host export 不执行行为，本包也没有用户配置字段。

### 检查并导航 roster

打开 workspace 会调用 `agentTeams/view`。Roster card 展示持久 name、运行时 status、model、diagnostics 与当前 task ownership。Pointer hover 或键盘 focus 通过 shared-layout motion 展开一个 card，同时让相邻 card 保持空间连续性；touch input 不合成 hover，reduced-motion 偏好会移除空间动画。空余容量显示为不可交互的开放席位，不会伪造 Team member。选择健康 teammate 时，系统刷新既有直接 child catalog，并打开普通的 `{ parentSessionId, childSessionId, mode: 'continuable' }` address。History 与后续人类 prompt 继续使用稳定 addressed-subagent 会话路径；本包不会添加 Team 专用 address 字段。

### 管理任务板

作为桌面 surface，workspace toolbar 还在动画暂停按钮旁提供外观切换控件：它从 theme runtime 读取已解析的 scheme，并把相反的值写为持久偏好，因此不会成为第二个主题状态来源。只有当 Team 有可委派的工作时（board 上存在 task，或已有成员在运行）才提供 spawn，因为 spawn 占用的名称是永久且不会复用的，全新的 workspace 不应把它作为最显眼的可用控件；在此之前第一个席位会说明这一点。Spawn 表单会声明该永久性并报告自身进度，因为该调用会一直保持到 teammate 到达持久的 active 或 failed 边界。Interrupt 与已入队的 message 各自留下简短确认，因为两者在轮询之间都不会体现在 card 上。若某成员的已分配 task 带有 write-scope 重叠警告，会直接显示在 roster 上而不仅在 task 内部，因为 scope 是提示性的而非锁。

运行中的 teammate card 在 card button 旁边显示中断控件 —— 绝不放在其内部，因为 card button 本身就是打开 teammate 的目标，而 button 不能嵌套。

任务板展示 task identity、owner、blocker、readiness、提示性 write scope 与重叠 warning。用户可以通过 `agentTeams/createTask` 与 `agentTeams/updateTask` 创建、编辑、分配或取消分配、完成、重开和删除任务。每次 update 都发送当前显示的 revision，create 或 update rejection 都保留为显式 business result。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Client export 挂载来自 [`@deepseek-ai/dsh-experimental-agent-team/remote`](../agent-team/README.zh.md) 的生成式 `ctx.remote.agentTeams` contribution，然后通过 Cordis effect 注册 locale dictionary 与一个 conversation-header slot。Dispose plugin fiber 会移除这两项 registration。

Workspace 打开期间会保持一个有界 `agentTeams/waitForChange` 调用，在每次观察到变化时重新加载整个 view 并重新进入等待；transport failure 会结束该循环，并把手动刷新留作退路。其中两个组件改编自 [prompt-kit](https://www.prompt-kit.com)：`TextShimmer` 标示 host 仍在置备中的 teammate，`Loader` 在首个 view 加载期间代替 roster。prompt-kit 提供的是基于 Tailwind 的 shadcn/ui 组件，而本 client 并不使用 Tailwind，因此它们是针对同一公开契约的重新实现而非安装：以 CSS module 与主题 token 取代 utility class，并由调用方传入本地化文案而非字面量。`TextShimmer` 保留原有的 `duration` 与 `spread` prop，包括 5..45 的钳制；`Loader` 在原有十二个 variant 中只保留 `dots` 与 `typing`，因为在此没有消费者的 variant 会成为无归属的公开选择。

开始 create 或 update 会让更早的 refresh 失效。成功后会重新读取完整 Team view，使每个 task 的派生字段保持最新。`team-task-conflict` 结果仅在重新读取成功后显示状态陈旧提示；如果重新读取失败，则保留该错误。由于 Team service 把任务文本或 scope 编辑与 dependency 修改公开为独立 action，两者使用两个连续的 compare-and-set mutation。

| 文件 | 职责 |
|---|---|
| [`src/client/mount.ts`](src/client/mount.ts) | 生成式 Remote、locale、导航与 slot registration |
| [`src/client/TeamAction.tsx`](src/client/TeamAction.tsx) | Workspace、shared-layout roster motion 与任务板交互状态 |
| [`src/client/locales.ts`](src/client/locales.ts) | 中英文 panel 文案 |
| [`src/index.ts`](src/index.ts) | 不执行行为的 Host entry |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Agent Teams Web profile](../agent-team-web-profile/README.zh.md)——挂载本 Client plugin 的源码 checkout bundle。
- [Agent Teams service](../agent-team/README.zh.md)——权威 roster、task 与 Remote 行为。
- [会话 UI](../../client/ui-conversation/README.zh.md)——稳定 header slot 与 addressed-subagent 导航表层。
- [实验性包](../README.zh.md)——孵化状态与发布排除规则。

-----

<a id="model-experience"></a>
## 模型体验

无直接影响，因为该浏览器 projection 与任务控制界面不注册面向模型的输入。

#### KV Cache 影响

无直接影响；Team 工具与普通会话提交负责后续任何模型可见用途。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **Snapshot refresh**——workspace 会在打开、显式 refresh 与 mutation 后刷新；它没有实时 event subscription 或 mailbox timeline。
- **普通 child continuation**——导航后发送的人类消息使用稳定 addressed-subagent prompt 路径，而不是 Team peer mailbox。
- **没有 lifecycle 或 workspace control**——panel 不能 spawn、rename、delete 或 interrupt teammate，write scope 仍只是提示性 metadata。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
