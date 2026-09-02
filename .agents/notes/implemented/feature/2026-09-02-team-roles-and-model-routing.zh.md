# Agent Note：从 role 配置一个 Team

Status: implemented

[English](2026-09-02-team-roles-and-model-routing.md) | 中文

## Problem

创建一位成员意味着手工组装四样东西：一个在本 Team 中从未用过的名字、一个职责标签、一段同时包含常驻指令与具体工作的开场 prompt，以及一个 context 模式。对于某一类成员来说，四者中有三样每次都相同；而唯一不同的那一样 —— 工作本身 —— 却被混进了与那些不变部分同一个字段里。

也没有任何东西携带模型。每位成员都运行在 Lead 的 route 上，因此一个 Team 无法把规划放在更大的模型上、把执行留在更小的模型上。这条接缝其实早就存在：`SubagentStartRequest.agentOptions` 携带 provider、model 与 reasoning effort，两个 in-process provider 也都声明了该能力。只是 Team 从未传递过任何东西。

## Decision

**role 携带除工作之外的一切。** 名称词干、简短职责、常驻 brief、context 模式，以及可选的 route。创建一位成员就是指定一个 role 并描述任务；brief 位于任务之上而不是取代它，因此 role 说明这位成员是做什么的，调用方说明要对此做什么。

**名字由 Team 派生。** role 的词干正是该 role 的每位成员都会想要的名字，因此第二位叫 `reviewer-2`，而不是撞上一个调用方从未选择、也看不见的名字。读者确实提供的名字仍然优先，用于一个 Team 拥有同一 role 的多位成员、并希望区分它们的情形。

**一个部署拥有哪些模型，是部署事实。** `Config.roles` 会整体替换内置集合。**没有任何内置 role 指定模型**，因此未做配置的 Team 完全运行在 Lead 的 route 上。这就是路由不以质量为代价的全部所在：除非有人明确要求，否则不会有任何东西被移到更小的模型上，而 route 上被省略的字段是继承而非覆盖。

**解析只有一个归属。** `resolveSpawn` 是一个对 (request, roles, 已用名字) 的纯函数，由服务的 `staffTeammate` 调用，而浏览器 Remote 与面向模型的 tool 都通过它。role 对两者意味着同一件事，而一位成员被创建时所用的内容是调用方可以读回的值，而不是 roster 在中途自行决定的东西。

**route 是持久的。** 它被记录在成员行上，而不是从存活的 Agent 读取。已经结束回合的成员没有存活的 Agent，此时 roster 的 `live?.options.model ?? root.options.model` 回退会为一位被路由到别处的成员报告 **Lead 的**模型 —— 这是关于「工作在哪里运行」的一句假话。现在的顺序是：存活的 Agent，然后是记录下来的 route，最后才是 Lead。

**表单展示这些 role，而不是把它们藏起来。** 每个 role 及其用途都在屏幕上，因为让读者在四个从未见过的东西之间做选择，不该交给一个一次只显示一项的控件。被选中的 role 会说明其成员从什么历史开始、运行在哪个模型上，因为这两件事都会改变读者即将得到的东西。

## Alternatives considered

**根据工作内容推断模型档位。** 直接否决。自动降级正是质量被悄悄损失的方式，而需求明确要求不得如此。role 是某人做过一次的决定，并在此后显示在 card 上。

**发布指定了模型的内置 role。** 否决：本仓库并不知道某个部署拥有哪些模型。写死的 `route` 只会是一次猜测，要么在请求时失败，要么悄悄把工作挪到更糟的地方。

**在表单中把 name、description 与 context 字段与 role 并列保留。** 对于 role 总会提供的那两个，否决；对 name 保留，因为它有真实的使用场景。把四个字段减到一次选择加一个字段正是目的所在。

**让 tool 的 `role` 参数接受任意字符串。** enum 就是该 Team 自己的 role id，因此不存在的 role 会在服务被询问之前就作为非法参数被拒绝。未配置任何 role 的 Team 根本不提供 enum，因为空 enum 不是任何 provider 会接受的 schema。

## Consequences

`TeamMemberSnapshot` 增加了两个可选字段，因此本包自己的 runtime invariant 与子系统页面中的 `type-equiv` 块都必须随之更新。invariant 在第一次运行时就捕获了这个变化，这正是它存在的意义。

手工组装的成员需要 name 与 description，但不需要 context 模式：丢掉 tool 长期以来的 `fresh` 默认值是一次回归，现有的 tool 测试立刻发现了它，现在它被恢复在解析步骤中 —— 其余的默认逻辑也都在那里。

`list_agents` 会报告 `roleId`，因此模型能看出哪位成员属于哪一类。tool 的输出 schema 拒绝未声明的属性，缺失的字段正是这样被发现的。

## Testing

`roles.spec.ts` 覆盖名字派生、route 投影，以及包括两种拒绝在内的每一条解析路径。Host 测试从一个 role 配置成员，并断言在它进入空闲之后 roster 仍报告该 role 的模型 —— 这正是持久 route 存在的理由 —— 另外还覆盖重复 id 的加载失败，以及读取 role 时的成员身份前置条件。Tool 测试断言面向模型的描述会列出每个 role 及其用途、enum 会拒绝未知 role，以及未配置 role 的 Team 会明说这一点。Client 测试断言表单只发送 role 与工作、名字仅在被覆盖时发送，以及在选定 role 之前无法配置任何成员。
