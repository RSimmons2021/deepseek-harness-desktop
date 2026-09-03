# Agent Note：作用域适配器消失，并不等于外壳接错了

Status: implemented

[English](2026-09-03-scope-adapter-lifetime.md) | 中文

## Problem

`createSlotRenderer().renderRoot` 把整个应用包在 `<ScopeProvider scope="session-maybe">` 里，而只要 `host.scope(...)` 返回空，这个 provider 就抛出 `SlotAssemblyError`。`SlotErrorBoundary` 有意重新抛出装配错误，而客户端经由一个上方没有任何边界的 `createRoot` 挂载，因此这次抛出会卸载整棵树：页面变白，且不再恢复。

适配器由插件通过 `ctx.effect` 安装，因此它的生命周期就是那个插件的生命周期。重载一个 patch 层会销毁 `ui-session`，`installScope` 的 disposer 删除适配器并发布一次 scope revision，于是 provider 会在替代者安装之前的空档里重新渲染。一次寻常的开发期重载就此杀死了整个应用。在使用 `patchReload: 'live'` 的 web profile 上，一次会话中观察到三次。

## Decision

**把「曾经在、现在没了」与「从来就没有过」区分开。** 对这个 host 至少安装过一次的作用域，属于正在交接：provider 什么都不渲染，等替代者落位后自然回来。而从未安装过的作用域，意味着这个组合里根本没有 session 插件，那就值得崩——没有任何东西会来填上这个空档。

`RootOutlet` 早已为注册项划出了同一条线：全部弃权的条目显示崩溃面，而在任何注册之前调用 `renderSlot('root')` 则抛出启动顺序的装配错误。现在这个 provider 与它的邻居保持一致。

**这个标记挂在 host 上，而不是挂在组件上。** `WeakMap<SlotRendererHost, Set<string>>` 能在 provider 重新挂载后继续有效，同时对一个真正全新的组合仍然从空开始——这正是让「大声失败」继续大声的原因。在渲染期间写入它，与同一文件中 `observableHook` 对 `hookCache` 的做法一致。

**两条路径都只调用一个 Hook。** 缺席路径调用 `observableHook(absentSource)`，使 Hook 顺序无论适配器是否解析成功都完全一致——这正是本文件里 `useAbsentSnapshot` 与 `keyedObservableHook` 已经在用的手法。

## Alternatives considered

**在空档期沿用上一次的 binding。** 否决：它确实能让树保持挂载、观感更好，但该 binding 指向的 Session，其所属插件已经消失，于是每一个消费方都会从一个已销毁的源上读取。空档期什么都不渲染，才是对「此刻可知之物」的诚实表述。

**在根之上加一层 error boundary。** 它能兜住崩溃，却无法区分上述两种情形，于是一个真正缺少 session 插件的组合只会退化成空白框架，而不会把问题说出来。这个诊断信息值得保留。

## Consequences

装配错误在设计上仍然是致命的；这次改动只是收窄了哪些状态算作装配错误。一次 patch 重载现在的代价是丢掉子树的 React 状态，而不是丢掉整个会话。

重载之后，`conversation.composer.bar` 仍会停在崩溃面上，直到下一次页面加载：在 `ui-conversation` 自己的服务交接期间，它的 inject 会抛出 `conversation service unavailable`。那是另一个包里的另一个缺陷，由 `SlotErrorBoundary` 按设计兜住；此前它不可见，只是因为整棵树先一步死了。

## Testing

在拥有 `createSlotRenderer` 的机制套件中，基于渲染器的假 host 写了两个测试。第一个移除一个已安装的适配器，断言树得以存活、内容清空，并在适配器回来时恢复；它在旧实现上会失败。第二个挂载一个从未安装过该作用域的 host，断言那次抛出仍然点名了它。

已在实机验证：在 `patchReload: 'live'` 下 touch 一个已构建的客户端产物会触发插件重载，而应用现在能挺过这次此前会让它变白的重载。
