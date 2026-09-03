---
description: "当某个成员的进行中任务已声明某个写入范围时，拒绝其他 Team 成员对该范围的文件写入。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-agent-team-write-lease

[English](README.md) | 中文

## 概述

`dsh-experimental-agent-team-write-lease` 把 [Agent Teams](../agent-team/README.zh.md) 任务板上仅作提示的 write scope 变成实际拒绝。任务声明的 scope 在该任务进行期间属于其 owner，本插件会在文件系统 tool 抵达后端之前，让其他成员对该范围内的写入失败。没有它，scope 重叠只是 Lead 在两个成员都已修改同一批路径之后才读到的事情。凡是运行 Team 层的地方都应挂载它；Team profile 已经这样做了。

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

[`@deepseek-ai/dsh-experimental-agent-team-profile`](../agent-team-profile/README.zh.md) 会挂载它，因此带有该层的 profile 已经在执行 lease。只有在手工组合 Team 各包时才需要直接挂载；它不接受任何配置。

### lease 覆盖什么

当某个任务处于 `in_progress`、其 owner 不是写入者、且它声明的某个 scope 覆盖了该路径时，写入被拒绝。其余情况一律放行：未被声明的路径、由尚未开始或已完成的任务持有的声明、无 owner 任务的声明，以及写入者自己的声明。执行只是在成员之间增加互斥，并不要求任何人在写入前先声明 scope，因此从不使用 write scope 的 Team 行为与此前完全相同。

重新指派任务会让其 lease 随之转移，完成任务则会为所有人释放该 scope。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 —— 点击展开</summary>

两个监听器分别注册在 `fs/write-intent` 与 `fs/edit-intent` 上，均使用 prepend，且均通过 `next()` 向下委派。prepend 很关键：`dsh-fs-observation-policy` 占据同一个单槽决策位且不向下委派，因此注册在它之后的 lease 永远不会运行。向下委派同样关键：自行应答 waterfall 的 lease 会丢掉该槽位本应产生的过期性保护。

执行写入的 Agent 来自 `ctx.agents.currentInitiator()`，而不是来自该接缝的 `actor` —— 文件系统 capability 有意把它定义为不透明对象。没有发起 Agent 的写入（即位于任何 Agent driver 链之外的写入）会交给链上其余部分处理。

决策本身属于 `TeamService.writeRefusal`，它拥有承载这些声明的任务板。本包只贡献这两处注册，以及模型读到的拒绝文案。

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 两处 prepend 的文件系统决策 |

**运行时不变量：** 不发布伴生插件。本包不拥有任何持久记录，也不拥有自己的可变关系：它只贡献两个监听器，向 `TeamService.writeRefusal` 索取决定，而该决定所读取的任务板由 Team domain 拥有。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Agent Teams](../agent-team/README.zh.md) —— 任务板、它的 write scope 与 `writeRefusal`。
- [文件系统 capability](../../fs/fs/README.zh.md) —— `fs/write-intent` 与 `fs/edit-intent` 决策槽。
- [Agent Teams profile](../agent-team-profile/README.zh.md) —— 挂载本插件的组合层。

-----

<a id="model-experience"></a>
## 模型体验

### 被拒绝的写入

#### 模型看到什么

被拒绝的写入会让 tool 调用失败，并给出 `write refused: <path> is inside "<scope>", claimed by task <id> in progress by <owner>`。文案点明路径、被声明的 scope、任务，以及持有它的成员，因此模型可以给该成员发消息、接管该任务，或转向别处工作，而不必猜测是什么挡住了它。

#### Token effect

无。本插件不注册任何 tool，也不添加任何 prompt 文本；一次拒绝的成本仅是该次失败调用自身的结果。

#### KV Cache effect

无。本插件贡献的任何内容都不会进入请求前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


- **仅覆盖文件系统 tool** —— lease 位于 `fs` tool 的决策槽上，因此 Bash、formatter、代码生成器，以及任何直接调用 `ctx.fs.writeText` 的路径，仍可写入他人 scope。这与既有版本保护的覆盖范围相同，Team 的「write scope 仅作提示」限制也记录了同一缺口。
- **scope 声明是字符串前缀** —— scope 通过完全相同或以 `/` 分隔的前缀来覆盖路径。不支持 glob、不解析符号链接，也不做超出任务板声明校验之外的规范化，因此同一目录的两种写法就是两个 scope。
- **lease 是进程内的** —— 它读取单个进程内的 Team 状态，而 Team 的 mailbox 已经说明不支持多个 harness 进程并发操作同一 Team。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者说明 —— 点击展开</summary>

本包自己的测试会针对一个「占据槽位且不向下委派」的决策者驱动 waterfall，这正是 observation policy 实际产生的顺序。若该 policy 将来开始向下委派，prepend 就不再是关键，但依然正确。

`writeRefusal` 返回拒绝而不是抛出，因此 Team service 不必引入文件系统词汇，而模型读到的 `write refused:` 文案由本包拥有。

</details>
