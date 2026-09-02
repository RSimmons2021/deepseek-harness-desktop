# DeepSeek Harness Desktop

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的一个 fork，为其增加了一个桌面应用，以及一个供 agent 团队协作的共享工作空间。

上游是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架），构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。这里的一切都是建立在它之上的插件：本 fork 没有改动 `packages/core` 下的任何文件。

上游文档：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## 本 fork 增加了什么

**一个桌面应用。** [`apps/desktop`](apps/desktop/README.zh.md) 在 Electron 中承载已构建的 Web profile：它以应用自有的 profile 启动一个真实的本地 `dsh` 进程，等待带鉴权的 loopback URL，再在沙箱化的 renderer 中加载该 origin。窗口自建四列框架 —— 会话侧栏、Team 工作空间、对话与详情列 —— 而不是浏览器的三列外壳。

**一个 Team 工作空间。** [`agent-team`](packages/experimental/agent-team/README.zh.md) 持有 Team 本身：成员 roster、被当作依赖图来读的共享任务板，以及一条 Team 记录过的事情的时间线 —— 它由 Lead 自己的会话日志投影而来，而不是另存一份可能与之矛盾的记录。[`client-ui-agent-team`](packages/experimental/client-ui-agent-team/README.zh.md) 是它的界面 —— 展示每位成员正在做什么、已经花费了多少的 card，依赖关系按 subject 从看板中选取的任务，以及会标记「自你上次查看以来新到达内容」的记录。它通过一条 stream 跟随运行中的 Team，而不是轮询。[`tool-agent-team`](packages/experimental/tool-agent-team/README.zh.md) 把同一块看板交给模型。

**被执行的 write scope。** [`agent-team-write-lease`](packages/experimental/agent-team-write-lease/README.zh.md) 把一个进行中任务所声明的 write scope 变成由该任务 owner 持有的租约。其他成员在该 scope 内的文件系统工具写入会失败，并报出路径、scope、任务以及持有它的成员 —— 足以让模型去给那位成员发消息、接管该任务，或转去别处工作。

**在应用内登录服务商。** [`authorization`](packages/credentials/authorization/README.zh.md) 挂载了 pi-ai 的服务商登录所要注册的那个接缝 —— 任何已发布的 bundle 都不会挂载它 —— 从而让 [`ui-settings-models`](packages/client/ui-settings-models/README.zh.md) 能够从 Models 页面登录服务商。凭据写入受管的凭据存储，而不是进程环境变量。

<a id="run"></a>

## 运行

<a id="run-from-source"></a>

### 从源码运行

安装 `Node.js` 与 `pnpm`，然后运行：

```sh
git clone https://github.com/RSimmons2021/deepseek-harness-desktop.git
cd deepseek-harness-desktop
pnpm install
pnpm desktop
```

`pnpm desktop` 会构建仓库、构建 Electron 入口并启动桌面应用。全新的 profile 会停在测试提示与 API key 提示之后，这正是它接上可用模型的方式；服务商也可以稍后从「设置 → Models」登录。

### Web UI

`pnpm dsh web` 会在浏览器中以 `http://127.0.0.1:3080` 提供同一个 Harness，直接使用 `pnpm run build` 产出的产物，而不会重新构建。Team 工作空间是一个 profile 层，因此需要先把它加入该命令所用的 profile：

```sh
pnpm dsh plugin --profile web add ./packages/experimental/agent-team-profile
pnpm dsh plugin --profile web add ./packages/experimental/agent-team-web-profile
```

上游也发布了无需检出仓库的 Web UI，即 `npx @deepseek-ai/dsh web`。该构建不含 Team 工作空间。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

## 开发者预览

上游处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更**，而本 fork 跟随上游。

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

## 社区与支持

- 与本 fork 有关的问题，请在它自己的 [issues](https://github.com/RSimmons2021/deepseek-harness-desktop/issues) 中提出。
- 面向上游的反馈与 bug 报告请提交至 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions)。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群：扫码添加企微小助手并填写入群问卷，完成后小助手会邀请你入群。

<table>
  <thead>
    <tr>
      <th align="center">企微小助手</th>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-assistant.png" alt="DeepSeek Harness 企微小助手二维码" width="180" height="180"></td>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
