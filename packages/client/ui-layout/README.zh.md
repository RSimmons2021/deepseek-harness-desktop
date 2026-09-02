---
description: "Web GUI 的外壳布局：三栏 AppFrame、拖动手柄与让步行为、面板几何服务与主题呈现；供窗口外观的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-layout

[English](README.md) | 中文

## 概述

本包提供 Web GUI 的外壳布局：一个三栏 AppFrame，带可缩放的侧栏与详情面板；一条让步链，在空间不足时先收缩详情栏、随后自动关闭它；以及 `ctx.layout` 面板几何服务，供其他插件调用以打开或关闭详情栏。它还承载主题呈现器，把解析后的配色方案、别名 token、正文字号与 `theme-color` 元数据投影到 document。需要标准窗口外观时选择它；面板几何是瞬时的，重新加载即重置。

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

「设置 → 通用设置」提供窗口的排布方式：**均衡**、**工作空间优先**（会话侧栏收起、对话列降到下限，让 Team 占据窗口）、**对话优先**，以及**全部展开**（详情列与其余各列一同打开）。该排布是 `ui-layout` 命名空间中的持久偏好，而它产生的宽度不是。preset 写入的是宽度偏好而非解析后的轨道，因此一个索取超过窗口所能提供的 preset，会与拖到同样宽度时完全一样地做出让步；此后再拖动会改变窗口，但不会改写它最初来自哪个排布。正是这一区分让排布能在重新加载后保留下来，而随手推过的几何不会。

在 root 槽位挂载本插件；它随即围绕占据侧栏、会话与详情栏的内容渲染应用框架。用户拖动不可见命中条带缩放侧栏、拖动浮动胶囊缩放详情面板；窗口变窄时只有详情栏收缩，随后自动关闭。关闭的侧栏保留 56px 控制栏；详情栏关闭到零宽度。

### 主题呈现

呈现器消费解析后的主题快照，并投影到 document：`html { color-scheme }` 驱动原生 UA 控件，依据当前配色方案设置 `body[data-ds-dark-theme]`，把主题的别名 token 与 `--dsh-content-font-size` 设为 body 上的内联变量，并持有一个 `<meta name="theme-color">`，其内容随计算后的 body 背景色更新。释放呈现器时，它会连同其他全局写入一起移除自己的元数据节点。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

一次 `register()` 调用把 `AppFrame` 贡献进运行时的内建 `'root'` 槽位，并在同一刻声明四个子槽位（`sidebar`、`conversation`、`details`、`shell.overlay`）、安放布局 store（面板几何）并接好 `ctx.layout` 面板动作服务。Electron surface 走同一调用的另一分支：它追加 `desktop.root` child slot 并贡献 `DesktopFrame`，把窗口布局为会话侧栏、Team workspace、conversation 与 details 四列。当前 Session 为空白时，Team column 会收起，由 conversation 占据空间：尚未发生任何事的 Session 只能显示无效的 roster，而 conversation 承载着解除阻塞所需的 workspace picker 与 composer。该 column 仍保持挂载，因此其 occupant 保留自身状态，其 ambient 也继续绘制窗口。该 frame 自身不绘制底色：桌面内容 seat 的 ambient 在所有列之下覆盖窗口，因此 frame 保持透明，而不是把列抬到它之上 —— 被抬起的列会成为 stacking context，并困住任何从其内部升起的 overlay，这正是设置面板被 conversation column 盖住的原因。它使用与 `AppFrame` 相同的 panel store 与相同的 `ctx.layout` 挂接，因此开合 details column 在两个 surface 上行为一致；并且它在每一条相邻 column 的接缝上都带有拖拽手柄：sidebar 边缘、workspace 与 conversation 共用的那条接缝，以及 details 边缘。workspace 是那条弹性轨道 —— 其余三条各自持有读者设定的宽度，workspace 取走窗口剩下的部分，因此把窗口拉宽就等于把主区域拉宽，无需任何人去拖动。它自己的 concession 链先让出 details column 的宽度，再让出 conversation 的宽度，然后彻底关闭 details，最后才让 workspace 低于自己的下限；偏好值从不被改写，因此窗口一度过窄不会付出任何代价。两侧有闭合 column 的接缝不会被渲染，因为那里没有可移动的东西。桌面内容 seat 绘制窗口的 ambient 底色，因此 frame 在 conversation column 上设置 `--dsh-conversation-surface: transparent`，并自备半透明阅读 scrim —— 使用纯色填充而非 backdrop blur，因为其背后是柔和渐变，而整列 backdrop filter 会让窗口每帧重新混合。瞬时布局 store 以默认宽度启动侧栏、保持详情栏关闭，从不读写 `localStorage`。AppFrame 始终挂载会话与详情两栏；已连接 Session 经 `SessionProvider` 渲染。它把所选 Session 标题投影到构建配置的产品标题或本地化 `common.brand.localBuild` 回退值之上，因此 locale revision 会随根 entry 一起更新文档元数据。主题呈现器是第二个 effect：从解析后的快照做纯 DOM 写入——初始状态经 getter 读取一次，此后仅事件驱动，不经过 React。它先应用调色板、字号与 token 变量，再把渲染出的背景测量为唯一的颜色依据。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当布局面不够用时阅读以下页面。它们从框架进入它所渲染的栏与它所呈现的主题。

- [ui-sidebar](../ui-sidebar/README.zh.md)——占据 `sidebar` 栏及其座位。
- [ui-conversation](../ui-conversation/README.zh.md)——占据 `conversation` 与 `details` 栏。
- [ui-theme](../ui-theme/README.zh.md)——呈现器消费其解析快照的主题 seam。
- [Web 客户端架构](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——浏览器插件行如何加载并注册槽位。

-----

<a id="model-experience"></a>
## 模型体验

无。布局外壳管理浏览器查看状态；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了当前布局行为。它们是当前包约束，不是通用窗口管理器对比或任务积压。

- **面板几何是瞬时状态**——重新加载会恢复侧栏默认值并保持详情栏关闭；在不同会话 id 之间切换同样会关闭详情栏并忘记拖动后的宽度，而未选中表面以零宽度渲染详情栏却不修改几何。
- **让步链自动关闭通过推导零宽度实现，不触碰偏好宽度**——窗口变宽时面板自行恢复；消费方不得把 store 中的详情宽度当作渲染真值。
- **挤压重排期间无滚动锚定**——布局变化可能移动读者的视口。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
