# Agent Note：每个 Team 成员的投入

Status: implemented

[English](2026-08-31-team-member-effort.md) | 中文

## Problem

Team roster 说明了成员是谁、正在做什么，却完全没有说明他们各自的开销。在有八个席位、每个 teammate 都能自行运行回合的情况下，Lead 唯一无法从界面得到答案的问题就是：哪个 teammate 正在消耗预算。

这些数据本就存在，只是无人读取。`session-stats` 维护回合与 step 计数，以及模型与工具的墙钟时间；`token-meter` 维护 provider 的输入、输出与缓存 token 总量。两者都是 Session projection，由各自的插件在每个已提交事件上维护。

## Decision

**投入是一次 projection 读取，既不折叠，也不读日志。** `TeamRoster.effortOf` 向 `ctx.sessionProjections.stateOf` 请求该成员的 `sessionStats` 与 `tokenUsage`。两者都是同步的，只触及 projection 运行时已经物化的状态，因此一次 roster 读取的开销与此前相同。

**两个单元彼此独立。** 只挂载其一的组合会报告存在的那一半，另一半为零 —— 因为一个已经运行过的成员，确实在无人统计的那一项上花费为零。两者都未挂载的组合则完全不报告 `effort`：字段缺失，而不是被置零，因为「没有东西在测量它」与「这个成员什么都没做」是不同的事实，把两者混为一谈的 roster 是在对一个空闲的 teammate 撒谎。

**不涉及金额。** 本仓库计价的对象是 token，而非货币：`route-pricing` 讲的是内容值多少 token。把模型映射到美元的费率表会成为无人拥有的、缺乏依据的公开选择，并且对每一个自行谈定费率的部署都是错的。`effort` 报告的是 harness 真正计量的资源。

**时间是工作的墙钟时间，而非存活时长。** `modelMs` 是在成功组装出消息的 step 上累加的模型时间，`toolMs` 是在配对成功的 call/result 上累加的工具时间，均来自 `sessionStats`。一个一小时前创建、只运行了四秒的 teammate 读作四秒。

**只有确实存在缓存时，card 才提及缓存。** `cacheReadTokens` 为 0 与「provider 不提供缓存」不是同一个事实，而一个总是显示该项的 tile 什么也没教给读者。

## Alternatives considered

**把 usage 折叠进 Team 自己的 journal。** 否决：它重复了两个本就正确的 projection，并且需要为每个 teammate 回合新增一个 Team 事件才能保持最新。

**通过 `sessionProjectionCache.cachedSnapshot` 读取冷成员的 checkpoint。** 想要，但此处不可达。它需要该成员的 `SessionHeader` 作为身份见证，而从 Session id 得到 header 的每条路径要么是异步的（`sessionPersistence.inspect`），要么会读取整份日志 —— 后者正是发现成本那项工作所排除的做法，而同步的 roster 读取则根本做不到。其后果记录在下方以及本包的限制清单中。

**把 `roster.list()` 改为异步，使冷路径变得可达。** 暂时否决：`list()` 支撑 `remoteView` 与面向模型的 roster tool，而 `inspect` 会为每个成员、每次刷新返回整份事件日志。用「每个 teammate 每个变化信号一次完整日志读取」换取冷成员的投入数据，正是 @ mention 发现成本那项工作已经拒绝过的交易。

**报告 `subagentTiming` 而非 `sessionStats`。** 否决：`subagentTiming` 由 subagent 包声明，只对 subagent Session 存在，因此 Lead 将没有时间数据，而 roster 会在同一列里承载两种不同含义的「时间」。

## Consequences

teammate 在两轮之间并未 attached，因此不报告任何投入；于是 roster 为正在运行的成员显示开销，为已经停下的成员什么都不显示 —— 这与事后复盘想要的恰好相反。这是该功能的主要局限，已记入本包的 Known Limitations。要消除它，需要在 Team journal 上建立持久的按成员开销记录，或需要一个今天并不存在的同步 header 查询。

`agent-team` 新增两个仅类型的 peer：`session-stats` 与 `token-meter`，用于它们的 `SessionProjectionMap` 与 `SessionProjectionStateMap` 合并。两者在运行时都不是必需的。

`session-stats` 由 `dsh-web-app` 挂载，`token-meter` 由 `dsh-base` 挂载，因此桌面与 Web 组合都会报告两者。两者都未挂载的 headless profile 不报告投入 —— 这是正确的，而非降级的。

## Testing

包内测试覆盖：Lead 读取两个单元、live teammate 读取自身 Session 而非 Lead 的 Session、其中一个单元存在而另一个缺失、两者都缺失，以及运行时已不再持有的成员。Client 测试覆盖 card 能打印的每一种时长与 token 量级 —— 毫秒、秒、分秒、千与百万 —— 以及 provider 未提供缓存命中的成员，和 roster 完全不报告投入的成员。
