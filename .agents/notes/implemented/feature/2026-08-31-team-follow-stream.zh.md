# Agent Note：Team 的实时更新变成 stream

Status: implemented

[English](2026-08-31-team-follow-stream.md) | 中文

## Problem

浏览器此前通过长轮询跟随 Team。`agentTeams/waitForChange` 保持一个有界等待，workspace 在它每次带着变化返回时重新发起该调用并重新加载 view。

该方法自己的契约就记录了代价：「wire 不承载 cancellation，因此有界 timeout 是等待唯一的终点：断开连接的浏览器会留下一个 wait 直到超时。」用户关闭标签页、刷新页面、网络中断 —— 每一种都会在 Host 上留下一个已注册的 waiter，最长可达整个超时时长，而每次重连又会再添一个。界面还持有一个它本不该编写的重试循环，并且每次观察到变化都要再花一次往返，去取 Host 刚刚判定已经变化的那个 view。

## Decision

**`follow` 是 stream，且 carrier 拥有其 cancellation。** `@Remote({ mode: 'stream' })` 本就是 Session 与 Workspace controller 用于同一形状的机制。断开连接的浏览器现在会立即结束其 Host 侧等待，因为 stream carrier 会中止生成器正在等待的那个 signal。不会留下任何注册项。

**每个 frame 承载完整 view。** 开场 frame 就是 view，之后每个 frame 也是 view。本 Team 的 view 是一份 roster 与一块任务板；重新计算它的代价小于让界面去折叠的增量词汇，而在每个 frame 上整体替换的 client 不会与 Host 发生漂移。它还消除了第二次往返：变化与它所产生的 view 一同到达。

**判别标签仍然保留。** 今天 `baseline` 与 `update` 的处理方式相同，但 `RemoteSnapshotStream` 需要知道哪个 frame 开启一代，重连的 client 也需要知道自己已经有内容可展示。这两个标签是给传输读的，而不是界面据以分支的区别。

**浏览器的 `waitForChange` Remote 被移除；service 方法保留。** model-facing tool 以自带 cancellation 的方式调用 `ctx.agentTeams.waitForChange(caller, timeoutMs, exec.signal)`，不受影响。被移除的只是那个 Remote 包装 —— 正是它因为 wire 不承载 cancellation 而不得不伪造一个 `AbortController`。预发布立场要求移除被取代的路径，而不是让它与替代者并存。

**界面不持有重试循环。** Gateway 负责跨 carrier 代次重新打开，界面只持有一个逻辑 stream：打开时启动，关闭或切换会话时释放。终止性失败会被报告，并把手动刷新留作退路 —— 这正是旧循环遇到 transport failure 时的行为。

**历史跟随 view，而非传输。** 读取记录活动此前位于重新加载内部。它现在是以 view 为键的独立 effect，因此无论新看板来自跟随的 frame 还是手动刷新，正是它让时间线值得重新读取。tail 本就是这样工作的。

## Alternatives considered

**保留轮询并缩短其 timeout。** 否决：这是用请求量换取泄漏的 waiter，而且它无法修复泄漏，只能缩短泄漏时长。

**发送增量而非完整 view。** 就本 Team 而言否决。增量词汇需要 client 侧的折叠、间隙检测，以及一代被替换时的重新同步路径 —— 而这一切只是为了在一个仅有若干 roster 行与任务的 view 上节省字节。

**把 activity 与 tail 的读取并入 stream。** 否决：它们是各自有上限的独立读取，而没有展开任何 card 的 client 不应收到它不会渲染的 tail frame。

**让 `waitForChange` 作为 Remote 与 `follow` 并存。** 依据预发布立场否决。两个实时更新接缝需要两套测试，并且会让消费者有可能选中那个带泄漏的。

## Consequences

`agentTeams/waitForChange` 不再存在于 wire 上。本仓库之外任何通过轮询跟随 Team 的消费者必须改用 `follow`；在仓库之内，浏览器是唯一的消费者。

Client 包现在依赖 `@deepseek-ai/dsh-api-gateway` 以获取 `RemoteSnapshotStream` 与 `$stream` 工厂 —— 这与 Session 和 Workspace client 出于同样原因所取的依赖相同。

界面在打开时、按下刷新按钮时，以及一次 mutation 之后仍会调用 `load()`，因此缓慢的 stream 绝不会让面板空白，而 mutation 的结果会在确认它的 frame 到达之前就可见。随后 stream 的开场 frame 会用相同内容替换该 view。

界面关闭时以及会话切换时都会停止跟随，因此一次会话切换是两次释放加一个新 stream，而不是一个被泄漏的 stream。

## Testing

Host 测试覆盖：开场 frame 承载当前 view、一次变化产生 update frame、carrier 的 cancellation（而非超时）结束跟随、未带变化而返回的等待不产生 frame、在取消之后才落定的变化不会到达任何人，以及并非 carrier 取消所致的等待失败会被报告。Client 测试通过 Gateway 自身的 `RemoteStream`、在一个可用连接之上驱动插件的绑定：开场 view 与后续 view 以同样方式被接受、跟随寻址 Lead 而非 teammate 会话、在开场 view 之后结束的一代与在其之前结束的一代被分别归类，以及按需释放。界面测试覆盖：跟随而来的 view 无需再次读取即可替换看板、终止性失败被呈现、为已离开会话而到达的 frame 与 failure 被丢弃，以及会话切换与关闭都会停止跟随。
