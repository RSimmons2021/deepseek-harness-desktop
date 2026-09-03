# Agent Note：把上游 0.1.2-rc.1 并入桌面 fork

Status: implemented

[English](2026-09-03-upstream-rc1-merge.md) | 中文

## Problem

本 fork 停留在 `0.1.2-alpha.1`，而上游已到 `0.1.2-rc.1` —— 相差 14,966 个 commit，其中 3,013 个是修复。原地不动意味着放弃这一切，并与 `agent-team` 越离越远：同一时间窗内上游改动了这个包 66 次。

逐个 cherry-pick 是最先想到的办法，而它在这里行不通。上游最有价值的那一个修复 `fix(agent-team): preserve mailbox order on cold resume` 在六个文件上冲突，其中包括 `fold.ts` —— 一个上游已经删除的文件。每一个 agent-team commit 都位于一次本 fork 并不具备的结构性变更之下。

## Decision

**一次合并，而不是一串 pick。** 预演把真实代价定在：97 个文件自动合并，41 处冲突，其中约 17 处是 lockfile、清单与双语文档对。这是一件有边界的工作；而手工重建 66 个 commit 不是。

**Team 的 fold 变成 projection。** 上游用注册式的 `teamProjectionDefinition` 取代了 `foldTeam`／`applyTeamEvent`／`TeamFoldState`，其 `TeamState` 以数组而非 Map 持有各行，也不再有名字索引，因为被投影的状态必须可序列化。`activityOf` 迁移到它之上；名字派生与未送达邮件计数改为扫描数组。一个 Team 受自身成员与消息上限约束，这正是扫描仍然站得住脚的原因。

**持久层没有任何变化，因此已记录的内容不受威胁。** 两边携带同样的四个事件 —— `team/member`、`team/task`、`team/message/queued`、`team/message/delivered` —— 而 fork 的 `roleId` 与 `route` 只是 `TeamMemberSnapshot` 上的可选新增。任一边写下的会话在另一边都能读。

**同伴消息统一为 steer，因此送达选项消失。** 上游移除了「安静 / 唤醒」之分。fork 选择跟随，而不是维持一个分叉的 mailbox：撰写框中的选择器已移除，`pendingMessages` 现在只统计目标无法接收的消息，而不是被有意不送达的消息。它的提示文案也照此改写。

**登录卡片改走上游的 operations 边界。** `ui-settings-models` 改为在插件主体中构建回调。credentials、llm 与 settings 都以这种方式抵达页面；登录卡片仍然直接取用 authorization 命名空间，因为它驱动的是一个流程，而不是读写设置。

## Alternatives considered

**保留 fork 的 `delivery` 字段。** 否决。一个 Host 已不再遵守的安静模式，会是一个说谎的控件；而维持分叉的 mailbox 正是让这次合并变贵的那笔成本。

**保留 `ModelsWire`。** 否决：在 credentials、llm 与 settings 都走 operations 之后，这个 wire 只剩一个字段且没有消费方。它被删除，而不是留作垫片。

**为拿到 map 合并而引用 `session-stats/src/projection.ts`。** 保留，并在 import 处记录了理由。token-meter 从其根部重新导出各 projection 模块，因此根部携带了键合并；session-stats 没有这样做，而它的 `./src/*` 导出是唯一能抵达该声明的路径。

## Consequences

上游新增的两道样式关卡否决了 fork 自己的 CSS：使用中性 token 的实线边框统一为发丝线；全圆角半径必须搭配 `corner-shape: round`，以免全局的超椭圆平滑把圆形变成方圆形。仅 Team 界面就有 13 条规则需要补上这一配对。

空的 invariant 伴生插件现在应当省略，而不是在代码里加以说明，因此 `agent-team-write-lease` 不再发布伴生插件，并在 README 中给出理由；它的构建配置也随之少了第二个 bundle 入口。

Client 包只在 `devDependencies` 中声明工作区输入。两份清单的并集合并把它们同时放进了两处，而依赖关卡会拒绝这种写法。

有三个套件只在全量并发下失败 —— 一个语法惰性加载与两个 `O(depth)` 检查 —— 单独运行均通过。它们早于这次合并就已存在。

## Testing

`typecheck`、`oxlint`、`hygiene`、`test:docs` 与 `build` 在合并后的树上全部通过，client、experimental 与 api 套件同样通过：6,236 个测试。有四个 Team 测试是被重写而非修复的，因为它们所描述的行为已经不存在：两个断言了不再存在的送达模式，一个断言发给空闲成员的消息会滞留队列（现在它会唤醒该成员），还有一个提供了组合中已经挂载的 `sessionProjections` 服务。
