# Agent Note：被声明的写入范围变成实际拒绝

Status: implemented

[English](2026-08-31-team-write-lease.md) | 中文

## Problem

Agent Teams 的任务可以声明 write scope，而在此之前，声明它什么也换不来。当两个进行中的任务重叠时，任务板会计算 `writeScopeWarnings`，roster 会在持有者的 card 上显示重叠，Web workspace 还会列出 scope 映射 —— 三个界面都在报告一次已经被允许发生的冲突。两个 teammate 可以一路修改同一批路径直到最终 diff，而 Lead 是靠读 diff 才发现的。

本包自己的限制清单称这些 scope 仅作提示，并指明了原因：没有任何东西在执行它们。

## Decision

**进行中任务所声明的 scope，在该任务进行期间属于它的 owner。** `TeamService.writeRefusal(agent, path)` 回答某个成员是否可以写入某个 workspace 相对路径；该决策属于 Team service，因为承载这些声明的任务板由它拥有。它只拒绝那一种具体冲突：任务处于进行中、owner 不是写入者、且被声明的 scope 覆盖了该路径。未被声明的路径、尚未开始或已完成任务的声明、无 owner 任务的声明，以及写入者自己的声明，一律放行；因此执行只是在成员之间增加互斥，并不要求任何写入之前先有声明。从不使用 write scope 的 Team，行为与此前完全相同。

**执行是一个独立的 Consumer 插件。** `dsh-experimental-agent-team-write-lease` 注册在文件系统 capability 的 `fs/write-intent` 与 `fs/edit-intent` 决策槽上。把它放在 service 之外，使 Team domain 不必引入文件系统词汇，也让组合可以在不启用它的情况下运行 Team 层。

**两个监听器都 prepend，也都向下委派。** `dsh-fs-observation-policy` 占据同一个单槽决策位且不调用 `next()`，因此注册在它之后的 lease 永远不会运行 —— 是 prepend 让 lease 可达，而不是靠哪个插件先加载。向下委派同样关键：自行应答 waterfall 的 lease 会丢掉该槽位本应产生的过期性保护。每个监听器都通过 `Promise.resolve().then` 延迟执行，使拒绝以 reject 的形式作用于 waterfall，而不是同步逃逸出去。

**执行写入的 Agent 来自 initiator 作用域，而非该接缝的 actor。** 文件系统 capability 有意把 `actor` 定义为不透明对象，深入其中会让本包依赖 tool 执行上下文的具体形状。`ctx.agents.currentInitiator()` 从该写入本就所处的 driver 链上回答同一个问题。没有发起 Agent 的写入会交给链上其余部分。

**拒绝文案给出模型采取行动所需的信息。** `write refused: <path> is inside "<scope>", claimed by task <id> in progress by <owner>` 给出路径、scope、任务与持有它的成员，因此模型可以给该成员发消息、接管该任务，或转向别处工作。文案归本包所有；`writeRefusal` 返回原因而不是抛出。

## Alternatives considered

**在 `FileSystem.writeText` 内部执行。** 否决：`FileSystem` 是该 capability 的 Service Definition，其 provider 是后端。让后端了解 Team membership 会颠倒这个接缝。

**拒绝一切位于写入者自身声明之外的写入。** 否决：这会迫使每个 Team 在任何人能编辑任何东西之前先采用 scope，并且会让通常根本不持有任务的 Lead 无法工作。

**不使用 prepend，依赖加载顺序。** 否决。当另一个监听器可以先占据槽位时，监听器顺序就不是执行保障 —— 而 observation policy 恰好就是这样做的。

**从 `actor` 读取执行写入的 Agent。** 否决：该接缝有意将其定义为不透明，强制类型转换会让本包耦合到文件系统 capability 主动不予暴露的 tool 执行上下文。

## Consequences

覆盖范围仅限文件系统 tool。Bash、formatter、代码生成器，以及任何直接调用 `ctx.fs.writeText` 的路径，仍可写入他人 scope —— 这与既有版本保护的覆盖范围相同，如今记录在两个包的限制清单中，而不再只在 Team 一侧。

scope 仍是字符串前缀：完全相同或以 `/` 分隔的包含关系，不支持 glob、不解析符号链接，也不做超出任务板声明校验之外的规范化。同一目录的两种写法仍是两个 scope。

重新指派会让 lease 随任务转移，完成任务则会释放它 —— 因为两者都由任务板派生，而不是单独保存在别处。没有可泄漏的东西，失败时也没有需要释放的东西。

`TeamService.writeRefusal` 读取 task view 而非原始快照，因此它给出的 owner 已被解析为与调用方自身 membership 相同的名字，两者可以直接比较。

## Testing

Team 包针对真实 Team、通过真实任务板覆盖该决策：尚未开始的声明不产生 lease、被声明的 scope 拒绝其他成员、owner 写入自己的声明、名称仅以该 scope 开头的同级目录、scope 自身的路径、重新指派转移 lease、完成任务释放它，以及并非 Team 成员的调用方。lease 包针对一个「占据槽位且不向下委派」的决策者驱动两个 waterfall —— 这正是 observation policy 实际产生的顺序 —— 覆盖放行的写入抵达该决策者、被拒绝的写入不抵达它、没有发起 Agent 的写入，以及 disposal 移除两处决策。profile 测试断言该层挂载了它。
