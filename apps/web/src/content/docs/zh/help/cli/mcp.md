---
title: 面向 AI 的 MCP
description: AI 如何通过 copalibre mcp 操作 CopaLibre。
---

`copalibre mcp` 启动一个本地 [Model Context Protocol](https://modelcontextprotocol.io) 服务器，
仅通过 stdio 通信——不使用 HTTP/SSE 传输。MCP 客户端（例如某个 AI agent）启动该进程并通过其标准输入/输出通信；
日志消息（横幅等）输出到 stderr，绝不会与协议数据混杂。

## 安装类工具

始终可用，无需配置令牌——它们与其对应的 CLI 命令在同一进程中运行完全相同的逻辑：

- **`copalibre_doctor`**：验证配置和依赖项（与 `copalibre doctor` 相同）。
- **`copalibre_module_list`**：列出已安装的模块。
- **`copalibre_upgrade_check`**：针对目标版本（`target_version`）检查模块兼容性和待应用的迁移，与
  `copalibre upgrade-check` 相同。

## 模块编写类工具

始终可用，无需令牌——它们只操作本地文件系统和 Git，绝不涉及 `apps/api`：

- **`copalibre_module_scaffold`**：生成一个结构有效的模块包，种子取自一个已有效的目录文档，作为一个已打标签的本地 Git 仓库。
- **`copalibre_module_validate_local`**：在不搜索或安装本地包的情况下对其进行验证。
- **`copalibre_module_submit`**：Fork `copalibre-modules`，在新分支上发布该模块，并打开一个拉取请求。

这正是此服务器存在的完整场景：AI 阅读某项运动的规则，向操作者询问所需的细节，在本地组装模块，验证它，将其安装到本地开发实例中实际试用（通过 `copalibre module add --source file://...`，没有单独的机制），并将其作为拉取请求提交——所有这些都无需离开 MCP 协议。

## 赛事运营类工具

仅当配置了 `COPALIBRE_MCP_TOKEN` 和 `COPALIBRE_API_URL` 时才会注册——没有令牌时，它们甚至不会出现在服务器的工具列表中，也绝不会尝试任何 HTTP 调用。`COPALIBRE_MCP_TOKEN` 是一个在其余 API 所使用的同一 OIDC/JWT
认证协议下已经有效的持有者令牌；此命令不会签发或管理令牌，只会转发它们。

- **`copalibre_get_organization`**：按别名读取一个组织。
- **`copalibre_list_tournaments`**：列出一个组织的活跃（未归档）赛事。
- **`copalibre_get_tournament`**：在某个组织内按别名读取一项赛事。
- **`copalibre_create_tournament`**：创建一项处于草稿状态的赛事。
- **`copalibre_publish_tournament`**：发布一项草稿赛事的配置。

这是一个初始的、经过精选的集合，并非对每个 `apps/api` 端点的详尽镜像——未来对其进行扩展是预期中的工作，而非固定限制。

## 配置 MCP 客户端

典型的 MCP 客户端会以子进程方式启动 `copalibre mcp`，并传入所需的环境变量（`DATABASE_URL`，以及用于赛事工具的可选
`COPALIBRE_MCP_TOKEN`/`COPALIBRE_API_URL`）。完整配置示例请参阅仓库中的
[`docs/MCP.md`](https://github.com/SebaSOFT/copalibre/blob/develop/docs/MCP.md)。

## 面向 AI 的文档

MCP 服务器会在 `initialize` 响应中公布自己的 `instructions`——与本页面相同的摘要，以 MCP 客户端在选择工具前会读取的形式呈现。同一实例也会在帮助站点根目录发布 `/llms.txt` 和 `/llms-full.txt`，供改为抓取渲染页面的 AI 使用。
