# Agent Note：Team 的记录历史进入 workspace

Status: implemented

[English](2026-08-31-team-activity-timeline.md) | 中文

## Problem

Agent Teams 会向 Lead Session 日志写入四类持久记录 —— `team/member`、`team/task`、`team/message/queued` 与 `team/message/delivered` —— 而没有任何界面把它们呈现为历史。浏览器 workspace 读取的 `agentTeams/view` 是一份时点投影：它回答 Team 现在在哪里，而不回答它是怎么走到这里的。

这一缺口恰好丢掉了投影无法保留的事件。已完成的 task 只显示最终 status，不显示它何时被认领、经手过谁。已送达的 message 在投递时离开 mailbox，因此入队与接收在成功的那一刻同时不可见 —— 而这两个边界恰恰是用户最想看到的，因为它们才说明 teammate 确实收到了工作。创建失败的 teammate 保留着 `failed` phase，但它此前的置备尝试已从 roster 上消失。

这些记录本就持久、本就有序，只是无人读取。

## Decision

**历史是对 Lead Session 日志的一次读取，而不是第二份记录。** `TeamService.remoteActivity` 遍历 `membership.root.session.events`，并通过 `activityOf` 投影每一条 Team 记录。不存在需要与日志保持同步的累加器，也不存在可能与 Team 实际行为相矛盾的东西。该读取由调用方给出的 limit 限定在 1 到 200 之间 —— `MAX_ACTIVITY_ENTRIES` —— 并按最新在前返回，因此界面请求的是它将要渲染的内容，而不是全部内容。

**`activityOf` 与 fold 一样跳过继承而来的记录。** fork 会继承祖先 Team 的记录，而 `applyTeamEvent` 早已忽略 `teamId` 与自身 fold 不同的记录。该投影带有同一道判断：没有它，fork 出的 Lead 会把另一个 Team 的过去列为自己的历史。

**条目携带结构化事实，而非句子。** `TeamActivityEntry` 保存序号、时间、kind、主体、它到达的状态，以及两种 message kind 的接收方。Client UI 文案按 locale 拥有，因此为条目命名的是渲染它的界面；由 host 组合好的字符串会把产品文案放进 service，并把同一种措辞强加给每一个消费者。

**状态保持持久词汇本身。** 条目报告记录实际持有的 member phase 或 task status。浏览器把每个值映射到文案，并对无法识别的值原样渲染，而不是丢弃该行：字典早于某个新 phase 的构建会显示一行它无法完全命名的记录，而不是一份带有缺口的 Team 历史。

**时间线跟随板的变化信号重新加载。** workspace 已经持有一个有界的 `agentTeams/waitForChange` 并在每次观察到变化时重新加载；历史就在同一次重新加载中读取。因此“Team 现在在哪里”与“它是怎么走到这里的”不会彼此脱节，也不存在第二个可能落后的轮询循环。两处 await 都对已切换的会话设有防护：为界面已离开的会话返回的历史会被丢弃，而被拒绝的历史不会影响与之同行的板。

## Alternatives considered

**把时间线渲染到桌面版的 details 栏。** 在读过 slot 账本后否决。`details` 是由 `ui-chat` 拥有的单一 slot，它只声明 `conversation.details.tool` 作为子 slot；声明即占有，因此不存在第二个拥有者。时间线放在 Team workspace 内部，位于它所解释的板下方。

**在 service 上维护一份滚动的内存历史。** 否决：它复制日志，需要自己的上限与淘汰策略，并引入第二个可能对过去判断错误的东西。日志本就是持久记录，本就有序。

**在 host 侧组合条目文本。** 依据 locale 拥有 client 文案的原则否决。它还会为该 Remote 的所有未来消费者固定一种措辞。

**用历史扩展 `agentTeams/view`。** 否决：view 是当前状态的投影，没有 limit 参数，而它的每一个调用方都将为自己并不渲染的条目付出代价。

## Consequences

该 Remote 每次调用最多返回 200 条，workspace 请求 40 条，因此长期运行的 Team 更早的历史无法从浏览器触达。当某个消费者确有需要时，分页是其扩展点；日志本身保有全部内容。

条目记录的是当时那条记录所携带的主体 —— 该 revision 下 task 的标题、member 的 name —— 因此改名在时间线中不具追溯性。这是被记录下来的事实，而非缺陷。

若某次投递对应的入队记录已不在 fold 中，该条目会给出接收方而发送方为空，因为发送方信息存放在入队记录上。

`packages/experimental/client-ui-agent-team/src/client/mount.ts` 新增一处 Remote 绑定，其箭头函数体没有任何 unit spec 执行，这与它旁边已有的八处绑定一致。该文件与 `TeamAction.tsx` 在干净工作树上就带有仓库中任何 spec 都无法触达的未覆盖行；该债务早于本次改动，本次不予处理。

## Testing

`fold.spec.ts` 覆盖四类记录各自投影为条目、非 Team 事件被跳过、入队记录已离开 fold 的投递、发往 fold 已不再持有的成员的消息，以及祖先 Team 的记录被拒绝。`team.spec.ts` 针对真实 Team 端到端覆盖该 Remote：Lead 日志中夹带非 Team 事件、task 的创建与认领之间的最新在前排序、limit 的截断，以及每一个越界 limit 被拒绝。Client spec 覆盖每个持久 phase 与 status 都有文案、未知状态原样渲染、空状态、被拒绝的历史不影响已加载的板，以及界面已离开的会话所返回的历史被丢弃。
