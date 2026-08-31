# Agent Note：观察 teammate 工作

Status: implemented

[English](2026-08-31-team-member-tail.md) | 中文

## Problem

Team workspace 只能说明某个 teammate 正在运行，却完全无法说明它在做什么。成员的状态是一个圆点；它的工作在它自己的会话里，而跳转过去要以读者正在观察的 workspace 为代价。把工作委派给四个 teammate，却只被告知四个圆点是绿的，这不叫监督。

Team 本就在观察每一个 Session 事件 —— mailbox 监听 `session/event` 以确认投递 —— 因此这些工作正从一个无法展示它们的 service 身边流过。

## Decision

**tail 读取成员自身已 attach 的 Session 日志。** `TeamService.remoteTail(agent, memberName, limit)` 投影该成员的 `session.events`，再反转并切片 —— 这与 Team 历史读取采用同一种形状，作用于一份已经在内存中的日志。不存在累加器，也没有需要保持同步的东西。

**仅限 attached，而在这里这恰恰是正确的范围。** 与成员的投入不同（那在它停下之后才最有意义），tail 是用来观察成员工作的 —— 而正在工作的成员按定义就是 attached 的。运行时不再持有的成员返回空，这与它的 roster row 已经报告的 inactive 是同一种状态。

**只取三类事件，而非全部。** `assistant/message` 承载成员的话，`tool/call` 说明它运行了什么，`tool/result` 承载返回了什么。reasoning 块、图片，以及 call/result 外壳都被丢弃：前者不是成员的答复，后两者没有正文。只调用了 tool 的 assistant step 不产生自己的行，因为它发起的调用本身就是各自的行。

**行在 service 侧截断，并且如实说明。** 每行 400 个 UTF-16 单元，被丢弃内容时标记 `truncated: true`。card 是摘要；完整记录只需一次跳转，而一个悄悄缩短文本的 tail 只会教会读者不信任它。

**变化信号扩展到包含成员的工作。** `waitForChange` 此前由 roster、task、mailbox 与 live-status 边界释放 —— 这些都不会在成员说话时触发，因此基于该信号的 tail 会一直陈旧到别的事情发生为止。`session/event` 观察者现在也会为 tail 展示的那三类事件释放 Team 等待者。这限定了频率：流式输出的成员每个 step 释放数次，而不是每个 token 一次，并且不涉及任何新传输。

**result 行不给出它的 tool 名。** `ToolResultBlock` 携带的是 call id 而非 tool 名，而 `tool/call` 行就紧挨在 tail 中的它旁边并已给出名字。把两者关联起来只会重复读者已经看得到的信息。

## Alternatives considered

**用 event stream 取代长轮询。** 本功能不需要。tail 的要求是「成员的工作能释放等待」，这是信号的改变，而非传输的改变。`waitForChange` 在 notify 时本就迅速返回；换成 stream 只是用另一种方式送达同样的行，同时替换掉一个正常工作的机制。

**card 展开期间用独立计时器轮询 tail。** 否决：与看板并行的第二套节奏会让两者对同一时刻产生分歧，而且会持续轮询一个已经停下的成员。

**包含所有事件类型，交由 client 过滤。** 否决：wire 会承载界面从不展示的 chunk 与 request header，而按行截断也将无从施加。

**在成员的 chunk 到达时即时流式呈现。** 暂时否决。那是一个确实不同的功能 —— 实时记录而非 tail —— 并且需要本次刻意没有构建的传输。晚一个 step 到达的完整 assistant 消息，才是 roster card 能有效展示的东西。

## Consequences

产生超长单行的成员，每行只显示前 400 个单元，并说明已截断。该上限不可配置：它是本 service 为所有消费者做出的呈现选择，而需要完整文本的调用方拥有该成员自己的会话。

`waitForChange` 触发得更频繁了。任何成员记录一条消息、一次调用或一个结果时，跟随该 Team 的所有界面都会重新加载 view —— 读取本身很廉价，但次数变多。观察空闲 Team 的部署不会感到任何行为变化。

card 收起时 tail 被丢弃而不是缓存，因此重新展开会重新读取。这样内存中只保留一个展开 card 所需的成员日志，而不是所有成员的。

## Testing

投影按事件类型逐一覆盖：伴有 reasoning 与图片的正文、只调用 tool 的 assistant step、只有 reasoning 的 step、带参数的调用、在上限处被截断的行、通过嵌套文本读取的结果，以及 tail 不展示的事件。Remote 针对真实 Team 覆盖：live 成员的三行按最新在前、limit 截断、以 `lead` 之名读取 Lead、未知名字、每一个越界 limit，以及运行时已释放的成员。变化信号从两侧覆盖 —— tail 展示的事件会释放一个未决等待、tail 不展示的事件让等待继续未决，以及背后没有 live Agent 的 Session 不释放任何等待。Client 覆盖展开 card 的 tail、它的截断标记、空状态、被拒绝的 tail 不影响 card 的其余部分，以及 card 收起时 tail 被丢弃。
